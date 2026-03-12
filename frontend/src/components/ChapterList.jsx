/**
 * ChapterList — the left panel showing chromosomes as book chapters.
 *
 * Each chromosome is a "chapter" button. Clicking one opens that chromosome
 * in the BookReader. The active chromosome is highlighted.
 *
 * Gene count is shown next to each chromosome name so the reader gets
 * a sense of how rich each chapter is before entering it.
 */
export default function ChapterList({
  chromosomes,
  activeChromosome,
  onChromosomeSelect,
}) {
  // Map display names: chr1 → Chr 1, chrX → Chr X, chrM → Mitochondrial
  function displayName(name) {
    if (name === "chrM") return "Mitochondrial";
    return name.replace("chr", "Chr ");
  }

  // Group autosomes separately from sex chromosomes + mitochondrial
  const autosomes = chromosomes.filter(
    (c) => !["chrX", "chrY", "chrM"].includes(c.name)
  );
  const special = chromosomes.filter((c) =>
    ["chrX", "chrY", "chrM"].includes(c.name)
  );

  function renderGroup(label, items) {
    return (
      <div className="chapter-group">
        <div className="chapter-group-label">{label}</div>
        {items.map((chrom) => (
          <button
            key={chrom.name}
            className={`chapter-item ${activeChromosome === chrom.name ? "active" : ""}`}
            onClick={() => onChromosomeSelect(chrom.name)}
            title={`${chrom.gene_count?.toLocaleString()} genes`}
          >
            <span className="chapter-name">{displayName(chrom.name)}</span>
            <span className="chapter-gene-count">
              {chrom.gene_count?.toLocaleString() ?? "—"}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <aside className="chapter-list">
      <div className="chapter-list-header">Chapters</div>
      {renderGroup("Autosomes", autosomes)}
      {renderGroup("Sex & Mito", special)}
    </aside>
  );
}
