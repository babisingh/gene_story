/**
 * ChromosomeOverview — displays all chromosomes as a row of vertical SVG bars.
 *
 * Shows every chromosome scaled to its true relative length.
 * The active chromosome is highlighted in amber; the current gene's
 * position is marked with a red dot and a dashed line across the bar.
 *
 * Clicking any chromosome calls onSelect(chromosomeName).
 *
 * Props:
 *   chromosomes          — array of { name, gene_count, length }
 *                          (from GET /api/v1/chromosomes)
 *   activeChromosome     — name of selected chromosome, e.g. 'chr17'
 *   genePositionFraction — optional 0–1, gene's position along the chromosome
 *                          pass (gene.start_pos / chromosome.length)
 *   onSelect             — callback(chromosomeName) on click
 */

// Approximate centromere positions as a fraction from the p-arm tip.
// Derived from UCSC cytogenetics reference data.
const CENTROMERE_POS = {
  chr1:  0.44, chr2:  0.39, chr3:  0.46, chr4:  0.39, chr5:  0.47,
  chr6:  0.40, chr7:  0.44, chr8:  0.44, chr9:  0.36, chr10: 0.39,
  chr11: 0.40, chr12: 0.35, chr13: 0.17, chr14: 0.18, chr15: 0.19,
  chr16: 0.47, chr17: 0.32, chr18: 0.38, chr19: 0.47, chr20: 0.46,
  chr21: 0.28, chr22: 0.28, chrX:  0.38, chrY:  0.28, chrM:  0.50,
};

// Canonical display order (autosomes → sex chromosomes)
const DISPLAY_ORDER = [
  'chr1','chr2','chr3','chr4','chr5','chr6','chr7','chr8',
  'chr9','chr10','chr11','chr12','chr13','chr14','chr15','chr16',
  'chr17','chr18','chr19','chr20','chr21','chr22','chrX','chrY',
];

function shortLabel(name) {
  if (name === 'chrX') return 'X';
  if (name === 'chrY') return 'Y';
  if (name === 'chrM') return 'M';
  return name.replace('chr', '');
}

export default function ChromosomeOverview({
  chromosomes,
  activeChromosome,
  genePositionFraction,
  onSelect,
}) {
  if (!chromosomes || chromosomes.length === 0) return null;

  // Build a name → chromosome map
  const chromMap = Object.fromEntries(chromosomes.map(c => [c.name, c]));

  // Only render chromosomes we have data for, in canonical order
  const ordered = DISPLAY_ORDER.filter(n => chromMap[n]);

  const maxLength = Math.max(...ordered.map(n => chromMap[n].length || 1));

  // SVG layout constants
  const MAX_H   = 72;
  const W_CHR   = 11;
  const GAP     = 4;
  const PAD     = 20;
  const svgW    = ordered.length * (W_CHR + GAP) - GAP + PAD * 2;
  const svgH    = MAX_H + 18;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Genome overview — click a chromosome to navigate"
    >
      <defs>
        {ordered.map((name, i) => {
          const active = name === activeChromosome;
          return (
            <linearGradient key={name} id={`cov-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={active ? 'oklch(72% 0.165 55)' : 'oklch(45% 0.025 260)'} stopOpacity="0.55" />
              <stop offset="50%"  stopColor={active ? 'oklch(78% 0.14 60)'  : 'oklch(52% 0.02 260)' } stopOpacity="0.90" />
              <stop offset="100%" stopColor={active ? 'oklch(72% 0.165 55)' : 'oklch(45% 0.025 260)'} stopOpacity="0.55" />
            </linearGradient>
          );
        })}
      </defs>

      {ordered.map((name, i) => {
        const chrom  = chromMap[name];
        const active = name === activeChromosome;
        const h      = Math.max((chrom.length / maxLength) * MAX_H, 4);
        const cen    = CENTROMERE_POS[name] ?? 0.40;
        const cenY   = cen * h;
        const pinchH = Math.min(h * 0.055, 2.8);
        const pinchOff = W_CHR * 0.225; // half the constriction offset
        const r      = W_CHR / 2;
        const x      = PAD + i * (W_CHR + GAP);
        const y      = MAX_H - h + 2;  // bottom-align all chromosomes

        const gPos = active && genePositionFraction != null ? genePositionFraction : null;

        return (
          <g
            key={name}
            transform={`translate(${x},${y})`}
            onClick={() => onSelect(name)}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(name)}
            aria-label={`Chromosome ${shortLabel(name)}, ${chrom.gene_count?.toLocaleString() ?? '?'} genes`}
            aria-pressed={active}
          >
            {/* ── p arm ─────────────────────────────────────────────── */}
            <path
              d={`
                M ${r} 0
                Q ${W_CHR} 0 ${W_CHR} ${r}
                L ${W_CHR} ${cenY - pinchH}
                Q ${W_CHR} ${cenY} ${W_CHR - pinchOff} ${cenY}
                Q ${W_CHR / 2} ${cenY + pinchH * 0.5} ${pinchOff} ${cenY}
                Q 0 ${cenY} 0 ${cenY - pinchH}
                L 0 ${r}
                Q 0 0 ${r} 0 Z
              `}
              fill={`url(#cov-grad-${i})`}
              opacity={active ? 1 : 0.75}
            />

            {/* ── q arm ─────────────────────────────────────────────── */}
            <path
              d={`
                M ${pinchOff} ${cenY}
                Q ${W_CHR / 2} ${cenY - pinchH * 0.5} ${W_CHR - pinchOff} ${cenY}
                Q ${W_CHR} ${cenY} ${W_CHR} ${cenY + pinchH}
                L ${W_CHR} ${h - r}
                Q ${W_CHR} ${h} ${r} ${h}
                Q 0 ${h} 0 ${h - r}
                L 0 ${cenY + pinchH}
                Q 0 ${cenY} ${pinchOff} ${cenY} Z
              `}
              fill={`url(#cov-grad-${i})`}
              opacity={active ? 1 : 0.75}
            />

            {/* ── Active glow ring ──────────────────────────────────── */}
            {active && (
              <rect
                x={-2} y={-2}
                width={W_CHR + 4} height={h + 4}
                rx={r + 1}
                fill="none"
                stroke="oklch(72% 0.165 55)"
                strokeWidth="1.5"
                opacity="0.7"
              />
            )}

            {/* ── Gene position marker ──────────────────────────────── */}
            {gPos != null && (
              <>
                <line
                  x1={-4} y1={gPos * h}
                  x2={W_CHR + 4} y2={gPos * h}
                  stroke="oklch(65% 0.22 25)"
                  strokeWidth="0.6"
                  strokeDasharray="1.5 1.5"
                />
                <circle
                  cx={W_CHR / 2} cy={gPos * h}
                  r={2.8}
                  fill="oklch(60% 0.22 25)"
                  stroke="white"
                  strokeWidth="0.8"
                />
              </>
            )}

            {/* ── Chromosome label ──────────────────────────────────── */}
            <text
              x={W_CHR / 2}
              y={h + 12}
              textAnchor="middle"
              style={{
                fontSize: '6px',
                fontFamily: "'DM Mono', monospace",
                fill: active ? 'oklch(72% 0.165 55)' : 'oklch(40% 0.015 260)',
                fontWeight: active ? '500' : '400',
                userSelect: 'none',
              }}
            >
              {shortLabel(name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
