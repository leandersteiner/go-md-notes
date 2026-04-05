export namespace main {
	
	export class Block {
	    id: string;
	    markdown: string;
	    sensitive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Block(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.markdown = source["markdown"];
	        this.sensitive = source["sensitive"];
	    }
	}
	export class FileNode {
	    name: string;
	    path: string;
	    isDir: boolean;
	    children?: FileNode[];
	
	    static createFrom(source: any = {}) {
	        return new FileNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.children = this.convertValues(source["children"], FileNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NoteDocument {
	    blocks: Block[];
	    noteSensitive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NoteDocument(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.blocks = this.convertValues(source["blocks"], Block);
	        this.noteSensitive = source["noteSensitive"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReencryptResult {
	    updatedFiles: number;
	    updatedRegions: number;
	
	    static createFrom(source: any = {}) {
	        return new ReencryptResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.updatedFiles = source["updatedFiles"];
	        this.updatedRegions = source["updatedRegions"];
	    }
	}
	export class WorkspaceState {
	    notesDir: string;
	    tree: FileNode[];
	    dirtyPaths: string[];
	    securityMode: string;
	    securityConfigured: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.notesDir = source["notesDir"];
	        this.tree = this.convertValues(source["tree"], FileNode);
	        this.dirtyPaths = source["dirtyPaths"];
	        this.securityMode = source["securityMode"];
	        this.securityConfigured = source["securityConfigured"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

