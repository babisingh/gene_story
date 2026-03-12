/**
 * ChromosomeIdeogram — draws a chromosome as an SVG ideogram.
 *
 * Shows the chromosome's G-band pattern (the alternating light and dark
 * bands visible under a microscope after Giemsa staining), with the
 * centromere marked and the current gene's position highlighted.
 *
 * The ideogram is drawn as a horizontal SVG bar.
 * Band colours follow the standard cytogenetics convention:
 *   gneg    → white/very light  (gene-rich euchromatin)
 *   gpos25  → light grey
 *   gpos50  → medium grey
 *   gpos75  → dark grey
 *   gpos100 → near-black        (gene-poor heterochromatin)
 *   acen    → red               (centromere)
 *   gvar    → medium grey with stripes (variable heterochromatin)
 *   stalk   → mid-grey
 *
 * Props:
 *   bands       — array of cytoband objects from the API
 *   chromLength — total length of chromosome in base pairs
 *   gene        — current gene object (has start_pos, end_pos, gene_name)
 */

const STAIN_COLORS = {
  gneg:    "#f5f5f5",
  gpos25:  "#d0d0d0",
  gpos50:  "#a0a0a0",
  gpos75:  "#686868",
  gpos100: "#303030",
  acen:    "#c0392b",
  gvar:    "#909090",
  stalk:   "#b0b0b0",
};

const SVG_WIDTH  = 700;
const SVG_HEIGHT = 44;
const BAR_Y      = 10;
const BAR_HEIGHT = 24;
const RADIUS     = 10; // rounded ends of chromosome

export default function ChromosomeIdeogram({ bands, chromLength, gene }) {
  if (!bands || bands.length === 0 || !chromLength) return null;

  // Scale a base-pair position to SVG x coordinate
  const scale = (bp) => (bp / chromLength) * SVG_WIDTH;

  // Gene marker position
  const geneStart  = scale(gene.start_pos);
  const geneEnd    = scale(gene.end_pos);
  const geneCenter = (geneStart + geneEnd) / 2;
  const markerW    = Math.max(geneEnd - geneStart, 3); // minimum 3px wide

  return (
    <div className="ideogram-wrapper">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Chromosome ideogram showing ${gene.gene_name} location`}
      >
        {/* ── Clip path to round the chromosome ends ──────────────────── */}
        <defs>
          <clipPath id="chrom-clip">
            <rect
              x={0} y={BAR_Y}
              width={SVG_WIDTH} height={BAR_HEIGHT}
              rx={RADIUS} ry={RADIUS}
            />
          </clipPath>
        </defs>

        {/* ── Chromosome bands ─────────────────────────────────────────── */}
        <g clipPath="url(#chrom-clip)">
          {bands.map((band, i) => (
            <rect
              key={i}
              x={scale(band.start_pos)}
              y={BAR_Y}
              width={Math.max(scale(band.end_pos) - scale(band.start_pos), 0.5)}
              height={BAR_HEIGHT}
              fill={STAIN_COLORS[band.stain] ?? "#cccccc"}
            />
          ))}
        </g>

        {/* ── Chromosome outline ───────────────────────────────────────── */}
        <rect
          x={0} y={BAR_Y}
          width={SVG_WIDTH} height={BAR_HEIGHT}
          rx={RADIUS} ry={RADIUS}
          fill="none"
          stroke="#999"
          strokeWidth={0.8}
        />

        {/* ── Gene position marker ─────────────────────────────────────── */}
        {/* Highlight rectangle over the gene's region */}
        <rect
          x={geneStart}
          y={BAR_Y}
          width={markerW}
          height={BAR_HEIGHT}
          fill="rgba(52, 152, 100, 0.55)"
          clipPath="url(#chrom-clip)"
        />

        {/* Triangle pointer below the bar */}
        <polygon
          points={`
            ${geneCenter - 5},${BAR_Y + BAR_HEIGHT + 2}
            ${geneCenter + 5},${BAR_Y + BAR_HEIGHT + 2}
            ${geneCenter},${BAR_Y + BAR_HEIGHT + 9}
          `}
          fill="#349864"
        />

        {/* Gene name label below the pointer */}
        <text
          x={geneCenter}
          y={SVG_HEIGHT - 1}
          textAnchor="middle"
          fontSize="9"
          fill="#349864"
          fontFamily="Inter, sans-serif"
          fontWeight="600"
        >
          {gene.gene_name}
        </text>
      </svg>
    </div>
  );
}
