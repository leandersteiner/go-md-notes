import {Block} from "../types/Block";

type EditorProps = {
    blocks: Block[];
    activeBlockId: string | null;
    onSelectBlock: (id: string) => void;
    onUpdateBlock: (id: string, markdown: string) => void;
    onInsertBelow: (id: string) => void;
    onMoveSelection: (id: string, delta: number) => void;
    onRemoveBlock: (id: string) => void;
};

export const Editor = ({
    blocks,
    activeBlockId,
    onSelectBlock,
    onUpdateBlock,
    onInsertBelow,
    onMoveSelection,
    onRemoveBlock,
}: EditorProps) => {
    return (
        <div className="editor-root line-editor">
            {blocks.map((block) => {
                const active = block.id === activeBlockId;
                return (
                    <section
                        key={block.id}
                        className={`line-row ${active ? "active" : ""}`}
                        onClick={() => onSelectBlock(block.id)}
                    >
                        {active ? (
                            <input
                                className="line-input"
                                value={block.markdown}
                                onChange={(e) => onUpdateBlock(block.id, e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        onInsertBelow(block.id);
                                    } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        onMoveSelection(block.id, -1);
                                    } else if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        onMoveSelection(block.id, 1);
                                    } else if (e.key === "Backspace" && block.markdown === "") {
                                        e.preventDefault();
                                        onRemoveBlock(block.id);
                                    }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Write markdown for this line..."
                                autoFocus
                            />
                        ) : (
                            <div
                                className="line-preview"
                                dangerouslySetInnerHTML={{__html: markdownToHtml(block.markdown)}}
                            />
                        )}
                    </section>
                );
            })}
        </div>
    );
};

const markdownToHtml = (markdown: string): string => {
    const lines = markdown.split("\n");
    const htmlLines = lines.map((line) => {
        if (line.startsWith("### ")) return `<h3>${inlineMarkdown(line.slice(4))}</h3>`;
        if (line.startsWith("## ")) return `<h2>${inlineMarkdown(line.slice(3))}</h2>`;
        if (line.startsWith("# ")) return `<h1>${inlineMarkdown(line.slice(2))}</h1>`;
        if (line.startsWith("> ")) return `<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`;
        if (line.startsWith("- ")) return `<li>${inlineMarkdown(line.slice(2))}</li>`;
        return `<p>${inlineMarkdown(line)}</p>`;
    });

    const merged = htmlLines.join("");
    return merged.replace(/(<li>.*?<\/li>)+/g, (match) => `<ul>${match}</ul>`);
};

const inlineMarkdown = (text: string): string => {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return out;
};

const escapeHtml = (text: string): string =>
    text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
