export type FileNode = {
    name: string;
    path: string;
    isDir: boolean;
    children?: FileNode[];
}

export type WorkspaceState = {
    notesDir: string;
    tree: FileNode[];
    dirtyPaths?: string[];
    securityMode: string;
    securityConfigured: boolean;
}
