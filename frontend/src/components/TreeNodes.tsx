import {FileNode} from "../types/Workspace";

type TreeNodesProps = {
    nodes: FileNode[];
    depth: number;
    selectedFile: string;
    hasUnsavedChanges: boolean;
    gitDirtyPaths: Record<string, boolean>;
    expandedDirs: Record<string, boolean>;
    onToggleDir: (dirPath: string) => void;
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>, path: string, isDir: boolean) => void;
    onSelectFile: (file: string) => void;
}

export const TreeNodes = ({
    nodes,
    depth,
    selectedFile,
    hasUnsavedChanges,
    gitDirtyPaths,
    expandedDirs,
    onToggleDir,
    onContextMenu,
    onSelectFile,
}: TreeNodesProps) => {
    return (
        <>
            {nodes.map((node) => (
                <div key={node.path}>
                    <div
                        className={`tree-node ${node.isDir ? "dir" : "file"} ${selectedFile === node.path ? "selected" : ""}`}
                        style={{paddingLeft: `${depth * 14 + 8}px`}}
                        onClick={() => {
                            if (node.isDir) {
                                onToggleDir(node.path);
                            } else {
                                onSelectFile(node.path);
                            }
                        }}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onContextMenu(event, node.path, node.isDir);
                        }}
                    >
                        <span className="tree-icon">
                            {node.isDir ? (
                                expandedDirs[node.path] ? <ChevronDownIcon/> : <ChevronRightIcon/>
                            ) : (
                                isMarkdownOrTextFile(node.name) ? <NoteFileIcon/> : <span className="tree-icon-spacer"/>
                            )}
                        </span>
                        <span className="tree-label">{node.name}</span>
                        {!node.isDir && selectedFile === node.path && hasUnsavedChanges ? (
                            <span className="tree-badge unsaved">unsaved</span>
                        ) : null}
                        {!node.isDir && gitDirtyPaths[node.path] ? (
                            <span className="tree-badge git">uncommitted</span>
                        ) : null}
                    </div>
                    {node.isDir && expandedDirs[node.path] && node.children && node.children.length > 0 ? (
                        <TreeNodes
                            nodes={node.children}
                            depth={depth + 1}
                            selectedFile={selectedFile}
                            hasUnsavedChanges={hasUnsavedChanges}
                            gitDirtyPaths={gitDirtyPaths}
                            expandedDirs={expandedDirs}
                            onToggleDir={onToggleDir}
                            onContextMenu={onContextMenu}
                            onSelectFile={onSelectFile}
                        />
                    ) : null}
                </div>
            ))}
        </>
    );
};

const ChevronRightIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const ChevronDownIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 7L10 13L16 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const NoteFileIcon = () => (
    <svg width="20" height="17" viewBox="0 0 24 20" fill="none" aria-hidden="true">
        <path d="M5 2H14L19 7V18H5V2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M14 2V7H19" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M8 11H16M8 14H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
);

const isMarkdownOrTextFile = (name: string): boolean => {
    const lower = name.toLowerCase();
    return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx") || lower.endsWith(".txt");
};
