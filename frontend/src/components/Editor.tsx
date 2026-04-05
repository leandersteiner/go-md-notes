import {Block} from "../types/Block";

type EditorProps = {
    blocks: Block[];
    activeBlockId: string | null;
    onSelectBlock: (id: string) => void;
    onUpdateBlock: (id: string, markdown: string) => void;
    onToggleSensitive: (id: string) => void;
    onAddBlock: () => void;
};

export const Editor = ({
    blocks,
    activeBlockId,
    onSelectBlock,
    onUpdateBlock,
    onToggleSensitive,
    onAddBlock,
}: EditorProps) => {
    return (
        <div className="editor-root">
            {blocks.map((block) => {
                const active = block.id === activeBlockId;
                return (
                    <section
                        key={block.id}
                        className={`editor-block ${active ? "active" : ""}`}
                        onClick={() => onSelectBlock(block.id)}
                    >
                        <header className="editor-block-header">
                            <code>{block.id}</code>
                            <label className="sensitive-toggle">
                                <input
                                    type="checkbox"
                                    checked={block.sensitive}
                                    onChange={() => onToggleSensitive(block.id)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                sensitive
                            </label>
                        </header>
                        {active ? (
                            <textarea
                                className="editor-textarea"
                                value={block.markdown}
                                onChange={(e) => onUpdateBlock(block.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Write markdown..."
                            />
                        ) : (
                            <div
                                className="editor-preview"
                                dangerouslySetInnerHTML={{__html: markdownToHtml(block.markdown)}}
                            />
                        )}
                    </section>
                );
            })}
            <button className="add-block-btn" onClick={onAddBlock}>+ Add Block</button>
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
