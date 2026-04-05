import {RangeSetBuilder} from "@codemirror/state";
import {Decoration, EditorView, ViewPlugin} from "@codemirror/view";
import type {ViewUpdate} from "@codemirror/view";

export const atxHeadingLineDecorations = ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();

        for (const {from, to} of view.visibleRanges) {
            let line = view.state.doc.lineAt(from);
            while (line.from <= to) {
                const match = line.text.match(/^(#{1,6})\s+/);
                if (match) {
                    const level = Math.min(match[1].length, 6);
                    builder.add(line.from, line.from, Decoration.line({
                        class: `cm-atx-h${level}`,
                    }));
                }
                if (line.to >= to) {
                    break;
                }
                line = view.state.doc.line(line.number + 1);
            }
        }

        return builder.finish();
    }
}, {
    decorations: (value) => value.decorations,
});

export const fencedCodeLineDecorations = ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const lineCount = view.state.doc.lines;

        let inFence = false;
        let fenceChar = "";
        let fenceLen = 0;

        for (let lineNo = 1; lineNo <= lineCount; lineNo++) {
            const line = view.state.doc.line(lineNo);
            if (!inFence) {
                const open = parseFenceOpen(line.text);
                if (!open) {
                    continue;
                }
                inFence = true;
                fenceChar = open.char;
                fenceLen = open.length;
                builder.add(line.from, line.from, Decoration.line({class: "cm-codeblock-start"}));
                continue;
            }

            if (isFenceClose(line.text, fenceChar, fenceLen)) {
                builder.add(line.from, line.from, Decoration.line({class: "cm-codeblock-end"}));
                inFence = false;
                fenceChar = "";
                fenceLen = 0;
                continue;
            }

            builder.add(line.from, line.from, Decoration.line({class: "cm-codeblock-mid"}));
        }

        return builder.finish();
    }
}, {
    decorations: (value) => value.decorations,
});

export const inlineCodeDecorations = ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const lineCount = view.state.doc.lines;

        let inFence = false;
        let fenceChar = "";
        let fenceLen = 0;

        for (let lineNo = 1; lineNo <= lineCount; lineNo++) {
            const line = view.state.doc.line(lineNo);

            if (!inFence) {
                const open = parseFenceOpen(line.text);
                if (open) {
                    inFence = true;
                    fenceChar = open.char;
                    fenceLen = open.length;
                    continue;
                }
            } else {
                if (isFenceClose(line.text, fenceChar, fenceLen)) {
                    inFence = false;
                    fenceChar = "";
                    fenceLen = 0;
                }
                continue;
            }

            const re = /`[^`\n]+`/g;
            let match: RegExpExecArray | null;
            while ((match = re.exec(line.text)) !== null) {
                const start = line.from + match.index;
                const end = start + match[0].length;
                builder.add(start, end, Decoration.mark({class: "cm-inline-code-pill"}));
                builder.add(start, start + 1, Decoration.mark({class: "cm-inline-code-delim"}));
                builder.add(end - 1, end, Decoration.mark({class: "cm-inline-code-delim"}));
            }
        }

        return builder.finish();
    }
}, {
    decorations: (value) => value.decorations,
});

const parseFenceOpen = (line: string): {char: string; length: number} | null => {
    const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (!match) return null;
    return {
        char: match[1][0],
        length: match[1].length,
    };
};

const isFenceClose = (line: string, marker: string, minLen: number): boolean => {
    const escaped = marker === "`" ? "\\`" : "~";
    const re = new RegExp(`^[ \\t]{0,3}${escaped}{${minLen},}[ \\t]*$`);
    return re.test(line);
};

export const editorThemeExtension = EditorView.theme({
    "&": {
        height: "100%",
        fontSize: "16px",
        backgroundColor: "#0f1720",
        color: "#e6eef7",
    },
    ".cm-scroller": {
        overflow: "auto",
        fontFamily: "\"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, monospace",
    },
    ".cm-content": {
        padding: "1rem",
        caretColor: "#f2f7ff",
    },
    ".cm-line": {
        color: "#e2ebf5",
    },
    ".cm-line.cm-atx-h1": {
        fontSize: "2em",
        fontWeight: "700",
        color: "#f5fbff",
    },
    ".cm-line.cm-atx-h2": {
        fontSize: "1.7em",
        fontWeight: "700",
        color: "#eef8ff",
    },
    ".cm-line.cm-atx-h3": {
        fontSize: "1.45em",
        fontWeight: "700",
        color: "#e7f4ff",
    },
    ".cm-line.cm-atx-h4": {
        fontSize: "1.25em",
        fontWeight: "700",
        color: "#ddecfb",
    },
    ".cm-line.cm-atx-h5": {
        fontSize: "1.1em",
        fontWeight: "700",
        color: "#d2e3f3",
    },
    ".cm-line.cm-atx-h6": {
        fontSize: "1em",
        fontWeight: "700",
        color: "#c6d8e8",
    },
    ".cm-line.cm-codeblock-start, .cm-line.cm-codeblock-mid, .cm-line.cm-codeblock-end": {
        backgroundColor: "#111c27",
        borderLeft: "1px solid #243848",
        borderRight: "1px solid #243848",
    },
    ".cm-line.cm-codeblock-start": {
        borderTop: "1px solid #243848",
        borderTopLeftRadius: "6px",
        borderTopRightRadius: "6px",
        marginTop: "0.2rem",
    },
    ".cm-line.cm-codeblock-end": {
        borderBottom: "1px solid #243848",
        borderBottomLeftRadius: "6px",
        borderBottomRightRadius: "6px",
        marginBottom: "0.2rem",
    },
    ".cm-line.cm-codeblock-start, .cm-line.cm-codeblock-end": {
        color: "#8aa0b3",
    },
    ".cm-inline-code-pill": {
        backgroundColor: "#182532",
        border: "1px solid #2a4255",
        borderRadius: "4px",
        padding: "0 0.2em",
        color: "#d8e8f7",
    },
    ".cm-inline-code-delim": {
        opacity: "0.5",
    },
    ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "#f3f8ff",
        borderLeftWidth: "2px",
    },
    ".cm-selectionBackground, ::selection": {
        backgroundColor: "#335a7a !important",
    },
    ".cm-activeLine": {
        backgroundColor: "#1a2a39",
    },
    ".cm-activeLineGutter": {
        backgroundColor: "#1a2a39",
    },
    ".cm-gutters": {
        backgroundColor: "#0f1720",
        color: "#8da6bf",
        borderRight: "1px solid #2c4155",
    },
    "&.cm-focused": {
        outline: "none",
    },
}, {dark: true});
