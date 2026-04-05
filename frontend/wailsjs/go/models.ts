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

}

