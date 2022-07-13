// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
//
// Copyright 2022 Ralf Flechsig
//
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { doesNotMatch } from 'assert';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { dir } from 'console';
import { ExecOptionsWithStringEncoding } from 'child_process';
import { getVSCodeDownloadUrl } from '@vscode/test-electron/out/util';

let quickFilePicker : QuickPicker;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "rfx-focf" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('rfx-focf.FolderOfCurrentFile', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from FolderOfCurrentFile!');
	});

	context.subscriptions.push(disposable);

    quickFilePicker = new QuickPicker(context);

	vscode.commands.registerCommand('rfx-focf.QuickPickFile', () => {
		quickFilePicker.show();
	});
	vscode.commands.registerCommand('rfx-focf.QuickPickFile.Refresh', () => {
		quickFilePicker.refresh();
	});

	context.subscriptions.push(disposable);

	let rootPath: string =
  	vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri.fsPath
    : "undefined";
	
	let dataprovider = new NodeDependenciesProvider(rootPath);
	vscode.window.registerTreeDataProvider(
		'rfx.folderExplorer',
		dataprovider
	  );
	  vscode.commands.registerCommand('rfx.folderExplorer.refreshEntry', () =>
	  dataprovider.refresh()
	  	);
	  let treeview = vscode.window.createTreeView('rfx.folderExplorer', {
		treeDataProvider: dataprovider
	  });

	let dirup = vscode.commands.registerCommand('rfx-focf.dirup', () => {
		dataprovider.dirUp();
	});
	// context.subscriptions.push(dirup);

	//   dataprovider.eventItemSelected = treeview.onDidChangeSelection;

	if( false )
	{
	  let disposable2 = vscode.commands.registerCommand('rfx-focf.focf', () => {
	  	// The code you place here will be executed every time your command is executed
	  	// Display a message box to the user
	  	vscode.window.showInformationMessage('Hello World from focf!');
	  });
  
	  context.subscriptions.push(disposable2);
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}

class FileRef implements vscode.QuickPickItem
{
	constructor(
		public fullpath:string
		,filename:string
		,dirfullpath:string)
		{
			this.label = filename;
			this.detail = dirfullpath;			
		}
	label: string;
	kind?: vscode.QuickPickItemKind | undefined;
	description?: string | undefined;
	detail?: string | undefined;
	picked?: boolean | undefined;
	alwaysShow?: boolean | undefined;
	buttons?: readonly vscode.QuickInputButton[] | undefined;
}

export class QuickPicker {
	public context: vscode.ExtensionContext | null = null;
	
	constructor(ctx:vscode.ExtensionContext){
		this.context = ctx;

		this.itemdict = new Map<string,FileRef>();

		this.refresh();
	}

	private itemdict : Map<string,FileRef>;
	private itemdictElemCount : number = 0;

	private ignDirsArr : Array<string> | undefined;
	private ignExtsArr : Map<string,null> = new Map<string,null>();

	async refresh()
	{
		this.itemdict.clear();
		this.itemdictElemCount = 0;

		if( this.context !== null ){

			/// add contribution.configuration
			/// https://code.visualstudio.com/api/references/contribution-points#contributes.configuration

			let config = vscode.workspace.getConfiguration().get("quickpickfile.dirs",);
			// let config = await this.context.globalState.get("quickpickfile.dirs");
			
			let ignDirs = vscode.workspace.getConfiguration().get("quickpickfile.ignoredirs");
			let ignExts = vscode.workspace.getConfiguration().get("quickpickfile.ignorefileexts");
			// vscode.window.showInformationMessage("type is " + typeof config);

			let arr = config as Array<string>;
			
			this.ignDirsArr = ignDirs as Array<string>;
			
			this.ignExtsArr.clear();
			let extsArr = ignExts as Array<string>;
			
			/// ensure ignDirsArr is always undefined, if not given in settings json
			if(this.ignDirsArr === null){
				this.ignDirsArr = undefined;
			}
			if(extsArr !== undefined && extsArr !== null){
				for(let i in extsArr)
				{
					/// ignore double entries causing issues
					// if( !this.ignExtsArr.has(extsArr[i])){
						this.ignExtsArr.set(extsArr[i],null);
					// }
				}

			}

			if( arr === undefined || arr === null ){
				vscode.window.showInformationMessage("There are no dirs in Settings for quickpickfile.dirs");
			}
			else{
				let start = Date.now();

				vscode.window.showInformationMessage("quickpickfile.dirs contains " + arr.length + " dirs.");
				for( var i in arr )
				{
					let dir = arr[i];

					try{
						this.addUniqueFilesToItemdictRecursive(dir);
						// vscode.window.showWarningMessage(result);
					}
					catch(e){
						vscode.window.showWarningMessage("exception when indexing: " + dir);
					}
				}

				let end = Date.now();
				let msNeeded = "" + (end - start) + " ms";

				vscode.window.showInformationMessage("quickpickfile.dirs indexing completed. ("+this.itemdictElemCount+" elements) "
					+msNeeded);
			}
		}
	}
	addUniqueFilesToItemdictRecursive(dir: string) {

		if( this.isIgnoredDir(dir) )
		{
			return;
		}
		
		let result = fs.readdirSync(dir,{ withFileTypes: true});

		for( var x in result )
		{
			let dirent = result[x];
			
			let fullpath = path.join(dir,dirent.name);
				
			if( dirent.isFile() )
			{
				if( this.isIgnoredFile(dirent.name))
				{
					/// do nothing with this file
				}
				else if( !this.itemdict.has(fullpath) ) {
					this.itemdict.set(fullpath, new FileRef(fullpath,dirent.name,dir));
					this.itemdictElemCount++;
				}
			}
			else
			{
				/// isDir
				this.addUniqueFilesToItemdictRecursive(fullpath);
			}
		}
	}
	isIgnoredFile(name: string) : boolean {
		
		let ext = path.extname(name);
		
		/// no extension cannot be ignored, via "ext" config
		if( ext === ""){ 
			/// e.g. for .gitignore (path.extname will return empty string)
			return this.ignExtsArr.has(name);
		 }

		return this.ignExtsArr.has(ext);
	}
	isIgnoredDir(dir: string) : boolean {
		
		if( this.ignDirsArr !== undefined)
		{
			for( let i in this.ignDirsArr )
			{
				let pattern = this.ignDirsArr[i];

				if( dir.indexOf(pattern) >= 0 )
				{
					/// found pattern in dir -> ignore it
					return true;
				}
			}
		}

		return false;

	}

	show() {
		let selection = vscode.window.showQuickPick<FileRef>(
			/*items*/ Array.from( this.itemdict.values() )
			,/*options*/{ canPickMany: false }
			,/*cancellationToken*/undefined);
	    
		selection.then((sel)=>{ 
			if( sel !== undefined ) {
				// vscode.window.showErrorMessage(sel.fullpath);
				vscode.commands.executeCommand("vscode.open",vscode.Uri.file(sel.fullpath));
			}
		});

			
	}

}

export class NodeDependenciesProvider implements vscode.TreeDataProvider<Dependency> {
  constructor(private workspaceRoot: string) {}

//   eventItemSelected(dep : vscode.TreeViewSelectionChangeEvent<Dependency>){
// 	vscode.window.showInformationMessage('click ' + dep.selection[0].fullpath);
//   }

  private lastRootDir : string | null = null;
  private isDirUpEvent : boolean = false;

  dirUp()
  {
	/// I don't know how to detect "origin" of refresh event in getChildren()
	/// hence i use this state-variables / event-flags
    this.isDirUpEvent = true;
	this.refresh();
  }

  getTreeItem(element: Dependency): vscode.TreeItem {
    return element;
  }

  private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | null | void> = new vscode.EventEmitter<Dependency | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
	
	if( !this.isDirUpEvent ){
	  this.lastRootDir = null;
	}

    this._onDidChangeTreeData.fire();
  }

  getChildren(element?: Dependency): Thenable<Dependency[]> 
  {
	let isDirUpCall : boolean = false;

	if( this.isDirUpEvent && this.lastRootDir !== null )
	{
		isDirUpCall = true;

    	this.isDirUpEvent = false;

		let parent = path.dirname(this.lastRootDir);

		return Promise.resolve(this.getFilesOfCurrentDir(parent,/*subdir*/false));
	}
	this.isDirUpEvent = false;
	
	
	if( element === undefined )
	{
        //vscode.window.showInformationMessage('Workspace has no package.json');
		if( vscode.window.activeTextEditor !== undefined)
		{
			var currentlyOpenTabfilePath = vscode.window.activeTextEditor.document.fileName;
			
	        return Promise.resolve(this.getFilesOfCurrentDir(currentlyOpenTabfilePath,/*subdir*/false));
		}
		else
		{
			vscode.window.showErrorMessage("Folder Explorer: No file opened in editor ... defaulting to C-Drive");

			return Promise.resolve(this.getFilesOfCurrentDir("C:\\",/*subdir*/false));
		}
	}
	else if( element.fullpath !== null )
	{
		return Promise.resolve(this.getFilesOfCurrentDir(element.fullpath,/*subdir*/true));
	} 
	else
		{
			vscode.window.showInformationMessage('unexpected element type');
			return Promise.resolve([]);
		}
    
  }

  private getDirElements(dir:string): string[]{

	let filesRet:string[]=[];

	filesRet = fs.readdirSync(dir);

	return filesRet;
  }

  /**
   * 
   * @param filepath directory or filepath (if filepath, owning dir is used)
   * @param isSubDir for sub dirs the dir title is not shown again
   * @returns a list of all dirs and files
   */
  private getFilesOfCurrentDir(filepath: string, isSubDir: boolean): Dependency[]{

	try{

	var dir: string;

	if( fs.lstatSync(filepath).isDirectory() )
	 {
		dir = filepath;
	 }
	 else
	 {
		dir = path.dirname(filepath);
	 }

	let dirs: Dependency[] = [];
	let fils: Dependency[] = [];
	
	if( !isSubDir )
	{
		this.lastRootDir = dir;

	  dirs.push( new Dependency(dir,"",false));
	  dirs.push( new Dependency("...","",false));
	}

	var dirElements = this.getDirElements(dir);

	// let fruits: string[] = ['Apple', 'Orange', 'Banana'];
	
		for( var i in dirElements )
		{
			try{
			let filename = dirElements[i];

			let fullpath = path.join(dir,filename);
			let isDirItself = fs.lstatSync(fullpath).isDirectory();
	
			// collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
			let state = vscode.TreeItemCollapsibleState.None;
			if( isDirItself ){ state = vscode.TreeItemCollapsibleState.Collapsed; }

			var d = new Dependency(
				filename
				,dir
				,isDirItself
				,state
			);

			if( isDirItself){dirs.push(d);}
			else{fils.push(d);}
			}
			catch{}/// just ignore files with permission errors
		}

		let conc = dirs.concat(fils);
		return conc;
	}
	catch (e:any){ 
		console.log(e,'error');
		vscode.window.showInformationMessage("Exception: " + e);
		return [];
	}
  }



  private pathExists(p: string): boolean {
    try {
      fs.accessSync(p);
    } catch (err) {
      return false;
    }
    return true;
  }
}

class Dependency extends vscode.TreeItem {
	public readonly fullpath:string;

  constructor(
    public readonly label: string,
    private directory: string,
	private isDirItself: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label}-${this.directory}`;
    this.description = "";
	/// https://microsoft.github.io/vscode-codicons/dist/codicon.html
	
	this.fullpath = path.join(this.directory,this.label);

	if( this.directory === ""){
			 this.iconPath = undefined;

	    if(this.label === "...")
		{
			this.command={command:"rfx-focf.dirup"
			,title:"dirup"
		};
		}
	}
	else
	{
		if( this.isDirItself  ){
			/// folder doesn't work ... causes weird offset in treeview
			this.iconPath = new vscode.ThemeIcon('folder');
			// collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		}
		else{
			this.iconPath = new vscode.ThemeIcon('file');

			this.command = {
				command:"vscode.open",
				title:"Open Call",
				arguments:[vscode.Uri.file(this.fullpath)]
			};
		}
	}
  }
}
