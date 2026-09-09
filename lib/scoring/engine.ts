export type ScoringQuestion = {
  id: string;
  code: string;
  moduleCode: string;
  dimension: string;
  direction: number;
  weight: number;
  sensitivity: "standard" | "private" | "signal";
};
export type ScoringAnswer = { question_id: string; selected: boolean };
export type DimensionScore = { code: string; label: string; module: string; selected: number; total: number; score: number; level: "kuat" | "berkembang" | "eksplorasi"; sensitivity: "standard" | "private" };
export type CoachingSignal = { questionId: string; code: string; title: string; severity: "info" | "review" | "priority" };

const LABELS: Record<string, string> = {
  SG:"Sosial & Ekspresif",KL:"Inisiatif & Arah",ML:"Terstruktur & Analitis",PL:"Tenang & Kolaboratif",IN:"Integritas",SA:"Kesadaran Diri",SP:"Nilai Spiritual",TJ:"Tanggung Jawab",RE:"Resiliensi",IS:"Inisiatif Bertumbuh",KO:"Kolaborasi",LE:"Kepemimpinan",KS:"Kontribusi Sosial",
  EA:"Kesadaran Emosi",ER:"Regulasi Emosi",RR:"Ketangguhan",SU:"Dukungan Sosial",HS:"Mencari Bantuan",
  FC:"Kejelasan Arah",FE:"Eksplorasi Karier",R:"Realistic",I:"Investigative",A:"Artistic",S:"Social",E:"Enterprising",C:"Conventional",AL:"Leadership",AE:"Entrepreneurship",AS:"Dampak Sosial",AG:"Global Exposure",CP:"Profesional/Perusahaan",CE:"Entrepreneurship",CA:"Akademik/Riset",CG:"Pemerintahan",CS:"Sosial/NGO",CD:"Pendidikan",VN:"Manfaat untuk Orang Lain",VF:"Kemandirian Finansial",VS:"Keselarasan Nilai",VL:"Belajar Sepanjang Hayat",KD:"Kontribusi Daerah"
};
const SIGNAL_TITLES: Record<string,string> = { OP1:"Cenderung menyimpan masalah sendiri",OP2:"Merasa perlu terlihat baik-baik saja",OP3:"Kesulitan bercerita tentang masalah pribadi",AC1:"Kecenderungan menyalahkan diri saat salah",AC2:"Fokus pada kekurangan diri cukup lama",XF1:"Ada situasi keluarga yang memengaruhi pikiran",XR1:"Ada situasi relasi yang sedang mengganggu",XA1:"Tekanan akademik terasa cukup berat",XM1:"Sedang bingung mengenai diri atau masa depan",CK1:"Ingin berbicara pribadi dengan fasilitator",CK2:"Mengharapkan pendampingan lebih dekat" };
function level(score:number):DimensionScore["level"]{if(score>=75)return"kuat";if(score>=50)return"berkembang";return"eksplorasi"}
function sortScores(items:DimensionScore[]){return[...items].sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code))}

export function buildAssessmentResult(questions:ScoringQuestion[],answers:ScoringAnswer[]){
  const answerMap=new Map(answers.map(a=>[a.question_id,a.selected]));
  const buckets=new Map<string,{module:string;selected:number;total:number;sensitivity:"standard"|"private"}>();
  const signals:CoachingSignal[]=[];
  for(const q of questions){
    const selected=answerMap.get(q.id)===true;
    if(q.sensitivity==="signal"){if(selected)signals.push({questionId:q.id,code:q.code,title:SIGNAL_TITLES[q.code]??`Perlu ditinjau bersama fasilitator (${q.code})`,severity:q.code==="CK2"?"priority":q.code==="CK1"||q.code.startsWith("X")?"review":"info"});continue}
    const weight=Number.isFinite(q.weight)&&q.weight>0?q.weight:1;const positive=q.direction<0?!selected:selected;
    const current=buckets.get(q.dimension)??{module:q.moduleCode,selected:0,total:0,sensitivity:q.sensitivity==="private"?"private":"standard"};
    current.total+=weight;if(positive)current.selected+=weight;if(q.sensitivity==="private")current.sensitivity="private";buckets.set(q.dimension,current);
  }
  const dimensions:DimensionScore[]=[...buckets.entries()].map(([code,v])=>{const score=v.total?Math.round(v.selected/v.total*100):0;return{code,label:LABELS[code]??code,module:v.module,selected:Math.round(v.selected*100)/100,total:Math.round(v.total*100)/100,score,level:level(score),sensitivity:v.sensitivity}});
  const mengenal=sortScores(dimensions.filter(i=>i.module==="MENGENAL_DIRI"));const memahami=sortScores(dimensions.filter(i=>i.module==="MEMAHAMI_DIRI"));const arah=dimensions.filter(i=>i.module==="MENENTUKAN_ARAH");
  const riasec=sortScores(arah.filter(i=>["R","I","A","S","E","C"].includes(i.code)));const careerTracks=sortScores(arah.filter(i=>["CP","CE","CA","CG","CS","CD"].includes(i.code)));const values=sortScores(arah.filter(i=>["VN","VF","VS","VL","KD"].includes(i.code)));
  return{summary:{character_top:mengenal.slice(0,4),emotional_resources:memahami.slice(0,3),signal_count:signals.length,priority_signal_count:signals.filter(i=>i.severity==="priority").length,note:"Hasil ini adalah bahan refleksi dan pendampingan, bukan diagnosis atau label psikologis."},dimensions:Object.fromEntries(dimensions.map(i=>[i.code,i])),careerOrientation:{riasec:riasec.slice(0,6),top_three:riasec.slice(0,3),career_tracks:careerTracks,values,clarity:arah.find(i=>i.code==="FC")??null,exploration:arah.find(i=>i.code==="FE")??null},signals};
}
