/** A unified diff, coloured the way a terminal would. */
export function DiffView({ text }: { text: string }) {
  return (
    <pre className="admin-diff max-h-[50vh] overflow-auto rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
      {text.split("\n").map((line, i) => {
        const cls = line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "del" : line.startsWith("@@") ? "hunk" : "";
        return (
          <div key={i} className={cls}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}
