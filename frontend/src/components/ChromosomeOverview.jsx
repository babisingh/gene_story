/**
 * ChromosomeOverview — all 24 chromosomes as vertical SVG bars.
 * Props: chromosomes[], activeChromosome, genePositionFraction (0-1), onSelect(name)
 */
const CENTROMERE_POS = {
  chr1:0.44,chr2:0.39,chr3:0.46,chr4:0.39,chr5:0.47,chr6:0.40,
  chr7:0.44,chr8:0.44,chr9:0.36,chr10:0.39,chr11:0.40,chr12:0.35,
  chr13:0.17,chr14:0.18,chr15:0.19,chr16:0.47,chr17:0.32,chr18:0.38,
  chr19:0.47,chr20:0.46,chr21:0.28,chr22:0.28,chrX:0.38,chrY:0.28,chrM:0.5,
};
const DISPLAY_ORDER = [
  'chr1','chr2','chr3','chr4','chr5','chr6','chr7','chr8',
  'chr9','chr10','chr11','chr12','chr13','chr14','chr15','chr16',
  'chr17','chr18','chr19','chr20','chr21','chr22','chrX','chrY',
];
const shortLabel = n => n==='chrX'?'X':n==='chrY'?'Y':n==='chrM'?'M':n.replace('chr','');

export default function ChromosomeOverview({ chromosomes, activeChromosome, genePositionFraction, onSelect }) {
  if (!chromosomes?.length) return null;
  const chromMap = Object.fromEntries(chromosomes.map(c=>[c.name,c]));
  const ordered  = DISPLAY_ORDER.filter(n=>chromMap[n]);
  const maxLen   = Math.max(...ordered.map(n=>chromMap[n].length||1));
  const MAX_H=72, W=11, GAP=4, PAD=20;
  const svgW = ordered.length*(W+GAP)-GAP+PAD*2;
  const svgH = MAX_H+18;
  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{width:'100%',height:'100%',overflow:'visible'}}
      preserveAspectRatio="xMidYMid meet" role="img" aria-label="Genome overview">
      <defs>
        {ordered.map((name,i)=>{
          const a=name===activeChromosome;
          return (
            <linearGradient key={name} id={`cov-${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={a?'oklch(72% 0.165 55)':'oklch(45% 0.025 260)'} stopOpacity="0.55"/>
              <stop offset="50%"  stopColor={a?'oklch(78% 0.14 60)' :'oklch(52% 0.02 260)' } stopOpacity="0.9"/>
              <stop offset="100%" stopColor={a?'oklch(72% 0.165 55)':'oklch(45% 0.025 260)'} stopOpacity="0.55"/>
            </linearGradient>
          );
        })}
      </defs>
      {ordered.map((name,i)=>{
        const c=chromMap[name], a=name===activeChromosome;
        const h=Math.max((c.length/maxLen)*MAX_H,4);
        const cen=CENTROMERE_POS[name]??0.4, cenY=cen*h;
        const pH=Math.min(h*0.055,2.8), pO=W*0.225, r=W/2;
        const x=PAD+i*(W+GAP), y=MAX_H-h+2;
        const gPos=a&&genePositionFraction!=null?genePositionFraction:null;
        return (
          <g key={name} transform={`translate(${x},${y})`} onClick={()=>onSelect(name)}
            style={{cursor:'pointer'}} role="button" aria-label={`Chr ${shortLabel(name)}`}>
            <path d={`M ${r} 0 Q ${W} 0 ${W} ${r} L ${W} ${cenY-pH} Q ${W} ${cenY} ${W-pO} ${cenY} Q ${W/2} ${cenY+pH*.5} ${pO} ${cenY} Q 0 ${cenY} 0 ${cenY-pH} L 0 ${r} Q 0 0 ${r} 0 Z`}
              fill={`url(#cov-${i})`} opacity={a?1:.75}/>
            <path d={`M ${pO} ${cenY} Q ${W/2} ${cenY-pH*.5} ${W-pO} ${cenY} Q ${W} ${cenY} ${W} ${cenY+pH} L ${W} ${h-r} Q ${W} ${h} ${r} ${h} Q 0 ${h} 0 ${h-r} L 0 ${cenY+pH} Q 0 ${cenY} ${pO} ${cenY} Z`}
              fill={`url(#cov-${i})`} opacity={a?1:.75}/>
            {a&&<rect x={-2} y={-2} width={W+4} height={h+4} rx={r+1} fill="none" stroke="oklch(72% 0.165 55)" strokeWidth="1.5" opacity=".7"/>}
            {gPos!=null&&<>
              <line x1={-4} y1={gPos*h} x2={W+4} y2={gPos*h} stroke="oklch(65% 0.22 25)" strokeWidth=".6" strokeDasharray="1.5 1.5"/>
              <circle cx={W/2} cy={gPos*h} r={2.8} fill="oklch(60% 0.22 25)" stroke="white" strokeWidth=".8"/>
            </>}
            <text x={W/2} y={h+12} textAnchor="middle" style={{fontSize:'6px',fontFamily:"'DM Mono',monospace",fill:a?'oklch(72% 0.165 55)':'oklch(40% 0.015 260)',fontWeight:a?'500':'400',userSelect:'none'}}>
              {shortLabel(name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
