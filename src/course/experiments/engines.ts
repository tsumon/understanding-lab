import type {
  ExperimentKind
} from '../types';
export type Config = Record<string, number | string>;
export type LocalText = {
  zh: string;
  en: string
};
const t = (zh: string, en: string): LocalText => ({
  zh, en
});
export interface Control {
  key: string;
  label: LocalText;
  min?: number;
  max?: number;
  step?: number;
  options?: {
    value: string;
    label: LocalText
  }[]
}
export interface Result {
  metrics: {
    label: LocalText;
    value: number | string
  }[];
  columns: LocalText[];
  rows: (number | string)[][];
  note: LocalText;
  series?: number[]
}
export const defaults: Record<ExperimentKind, Config> = {
  'data-split': {
    strategy: 'mixed', train: 0.5
  }, regression: {
    slope: 0, intercept: 0, outlier: 'off'
  }, overfitting: {
    degree: 1, noise: 0.3
  },
  'gradient-descent': {
    rate: 0.1, scale: 1
  }, classification: {
    threshold: 0.5, cost: 4
  }, 'neural-network': {
    model: 'linear', threshold: 0.5
  },
  embeddings: {
    query: 'cat', magnitude: 1
  }, attention: {
    focus: 'animal', temperature: 1, mask: 'off'
  }, generation: {
    temperature: 1, topk: 4
  },
  rag: {
    query: 'opening', topk: 2, minimum: 0.2
  }, evaluation: {
    model: 'specialist', hard: 0.2
  }, safety: {
    threshold: 0.7, cost: 10
  },
};
const range = (key: string, zh: string, en: string, min: number, max: number, step: number): Control => ({
  key, label: t(zh,en), min,max,step
});
const select = (key: string, zh: string, en: string, options: [string,string,string][]): Control => ({
  key,label:t(zh,en),options:options.map(([value,z,e])=>({
    value,label:t(z,e)
  }))
});
export const controls: Record<ExperimentKind, Control[]> = {
  'data-split': [select('strategy','划分方式','Split strategy',[['mixed','混合每人的两次访问','Mix two visits per person'],['grouped','按人留出','Hold out people']]),range('train','训练比例','Training fraction',0.25,0.75,0.25)],
  regression: [range('slope','斜率','Slope',-2,4,0.25),range('intercept','截距','Intercept',-2,4,0.25),select('outlier','异常点','Outlier',[['off','无','Off'],['on','加入一个异常点','Add one outlier']])],
  overfitting: [range('degree','多项式次数','Polynomial degree',1,9,1),range('noise','训练噪声强度','Training noise',0,0.6,0.1)],
  'gradient-descent': [range('rate','学习率','Learning rate',0.01,1.1,0.01),range('scale','特征尺度','Feature scale',1,5,1)],
  classification: [range('threshold','阳性阈值','Positive threshold',0.1,1,0.1),range('cost','一次漏报的代价','Cost per false negative',1,10,1)],
  'neural-network': [select('model','模型结构','Model structure',[['linear','线性分数 x₁+x₂','Linear score x₁+x₂'],['relu','两条 ReLU 隐藏通路','Two ReLU hidden paths']]),range('threshold','分类阈值','Decision threshold',0.25,1.75,0.25)],
  embeddings: [select('query','查询词','Query word',[['cat','猫','Cat'],['dog','狗','Dog'],['car','汽车','Car']]),range('magnitude','查询向量长度倍数','Query vector length multiplier',0.25,4,0.25)],
  attention: [select('focus','查询关注点','Query focus',[['animal','动物','Animal'],['action','动作','Action']]),range('temperature','注意力温度','Attention temperature',0.2,2,0.2),select('mask','因果掩码：查询位置为第 2 词','Causal mask: query at token 2',[['off','关闭','Off'],['on','开启','On']])],
  generation: [range('temperature','采样温度','Sampling temperature',0.1,2,0.1),range('topk','保留候选数 top-k','Candidates retained (top-k)',1,4,1)],
  rag: [select('query','问题','Question',[['opening','图书馆几点开门？','When does the library open?'],['returns','借书多久归还？','When are books due?'],['weather','明天天气如何？','What is tomorrow’s weather?']]),range('topk','检索文档数','Documents retrieved',1,3,1),range('minimum','最低证据分数','Minimum evidence score',0.1,1,0.1)],
  evaluation: [select('model','模型','Model',[['specialist','常见场景专长模型','Common-case specialist'],['balanced','均衡模型','Balanced model']]),range('hard','困难组占比','Hard-group proportion',0,1,0.1)],
  safety: [range('threshold','自动处理最低置信度','Minimum confidence for automation',0.5,1,0.05),range('cost','自动错误代价','Cost per automatic error',1,20,1)],
};
const metric = (zh:string,en:string,value:number|string)=>({
  label:t(zh,en),value
});
const round = (x:number)=>Number.isFinite(x)?Number(x.toFixed(4)):0;
const num=(c:Config,key:string, fallback=0)=>typeof c[key]==='number' && Number.isFinite(c[key])?c[key] as number:fallback;
export function normalizeConfig(kind:ExperimentKind, input:Config = {
}):Config {
  const out={
    ...defaults[kind]
  };
  for(const control of controls[kind]) {
    const value=input[control.key];
    if(control.options) {
      if(control.options.some(o=>o.value===value))out[control.key]=value;
    } else if(typeof value==='number'&&Number.isFinite(value)){
      const step=control.step!;
      out[control.key]=round(Math.min(control.max!,Math.max(control.min!,Math.round((value-control.min!)/step)*step+control.min!)));
    }
  }
  return out;
}
export function softmax(scores:number[],temperature=1):number[]{
  if(!scores.length)return [];
  const temp=Math.max(0.01,Number.isFinite(temperature)?temperature:1);
  const max=Math.max(...scores);
  const ex=scores.map(s=>Math.exp((s-max)/temp));
  const sum=ex.reduce((a,b)=>a+b,0);
  return ex.map(x=>x/sum);
}
export function cosine(a:number[],b:number[]):number {
  if(a.length!==b.length||!a.length)return 0;
  const denominator=Math.hypot(...a)*Math.hypot(...b);
  return denominator? a.reduce((s,x,i)=>s+x*b[i],0)/denominator:0;
}
export function confusion(probabilities:number[],labels:number[],threshold:number){
  let tp=0,fp=0,tn=0,fn=0;
  probabilities.forEach((p,i)=>{
    if(p>=threshold){
      if(labels[i])tp++;
      else fp++;
    }else if(labels[i])fn++;
    else tn++;
  });
  return {
    tp,fp,tn,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null
  };
}
function solve(matrix:number[][],b:number[]):number[]{
  const a=matrix.map((r,i)=>[...r,b[i]]);
  for(let i=0;
  i<b.length;
  i++){
    let p=i;
    for(let j=i+1;
    j<b.length;
    j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;
    [a[i],a[p]]=[a[p],a[i]];
    const d=a[i][i]||1e-12;
    for(let k=i;
    k<=b.length;
    k++)a[i][k]/=d;
    for(let j=0;
    j<b.length;
    j++)if(j!==i){
      const f=a[j][i];
      for(let k=i;
      k<=b.length;
      k++)a[j][k]-=f*a[i][k];
    }
  }return a.map(r=>r[b.length]);
}
function fitPolynomial(xs:number[],ys:number[],degree:number){
  const features=xs.map(x=>Array.from({
    length:degree+1
  },(_,p)=>x**p));
  const matrix=Array.from({
    length:degree+1
  },(_,i)=>Array.from({
    length:degree+1
  },(_,j)=>features.reduce((s,r)=>s+r[i]*r[j],0)+(i===j?1e-8:0)));
  const b=Array.from({
    length:degree+1
  },(_,i)=>features.reduce((s,r,j)=>s+r[i]*ys[j],0));
  const w=solve(matrix,b);
  return(x:number)=>w.reduce((s,v,p)=>s+v*x**p,0);
}
const mse=(actual:number[],pred:number[])=>actual.reduce((s,x,i)=>s+(x-pred[i])**2,0)/actual.length;
export function runExperiment(kind:ExperimentKind, raw:Config):Result {
  const c=normalizeConfig(kind,raw);
  if(kind==='data-split') {
    // IDs are non-semantic. A memorizer can only exploit a matching person's other visit.
    const people=Array.from({
      length:12
    },(_,i)=>({
      id:i+1,label:[1,0,1,1,0,0,1,0,0,1,0,1][i]
    }));
    const trainCount=Math.round(24*num(c,'train'));
    const grouped=c.strategy==='grouped';
    const train=grouped?people.slice(0,trainCount/2).flatMap(p=>[p.id,p.id]):[...people.slice(0,Math.min(trainCount,12)).map(p=>p.id),...people.slice(0,Math.max(0,trainCount-12)).map(p=>p.id)];
    const visits=people.flatMap(p=>[p,p]);
    const used=new Map<number,number>();
    train.forEach(id=>used.set(id,(used.get(id)||0)+1));
    const test=visits.filter(p=>{
      const n=used.get(p.id)||0;
      if(n){
        used.set(p.id,n-1);
        return false;
      }return true;
    });
    const known=new Set(train);
    const rows=test.map(p=>[p.id,p.label,known.has(p.id)?p.label:0,known.has(p.id)?'1':'0']);
    const correct=rows.filter(r=>r[1]===r[2]).length;
    return {
      metrics:[metric('测试准确率','Test accuracy',round(correct/test.length)),metric('测试记录中身份已见比例','Test records with seen identity',round(test.filter(p=>known.has(p.id)).length/test.length)),metric('训练 / 测试访问数','Train / test visits',`${train.length} / ${test.length}`)],columns:[t('人员 ID','Person ID'),t('真实标签','Label'),t('预测','Prediction'),t('训练见过该人 (1=是)','Person seen in train (1=yes)')],rows,note:t('固定 12 人、每人两次访问。模型只记住人员标签；未见的人一律预测 0。身份特征无可泛化规律，混合访问的高分不能证明对新人的能力。','Fixed 12 people with two visits each. The model only memorizes identities and predicts 0 for unseen people. Identity has no generalizable signal; mixed-visit accuracy is not evidence about new people.')
    };
  }
  if(kind==='regression') {
    const xs=[-2,-1,0,1,2];
    const ys=[-2.8,-1.2,1.1,2.9,c.outlier==='on'?10:5.2];
    const predictions=xs.map(x=>num(c,'slope')*x+num(c,'intercept'));
    return{
      metrics:[metric('均方误差 MSE','Mean squared error',round(mse(ys,predictions)))],columns:[t('x','x'),t('观测 y','Observed y'),t('预测 y','Predicted y'),t('平方误差','Squared error')],rows:xs.map((x,i)=>[x,ys[i],round(predictions[i]),round((ys[i]-predictions[i])**2)]),note:t('逐点计算 (预测−观测)² 再取平均。异常点会放大平方损失；这里不自动寻找最优参数。','Square each prediction minus observation, then average. An outlier has disproportionate influence under squared loss; parameters are not optimized automatically.'),series:predictions
    };
  }
  if(kind==='overfitting') {
    const xs=Array.from({
      length:10
    },(_,i)=>-1+2*i/9);
    const truth=(x:number)=>Math.sin(Math.PI*x);
    const noises=[.2,-.8,.7,-.4,.9,-.6,.5,-.9,.4,.1];
    const ys=xs.map((x,i)=>truth(x)+num(c,'noise')*noises[i]);
    const predict=fitPolynomial(xs,ys,num(c,'degree'));
    const test=Array.from({
      length:41
    },(_,i)=>-1+2*(i+.5)/41);
    return{
      metrics:[metric('训练 MSE','Training MSE',round(mse(ys,xs.map(predict)))),metric('无噪声留出网格 MSE','Clean held-out grid MSE',round(mse(test.map(truth),test.map(predict))))],columns:[t('x','x'),t('训练观测','Training observation'),t('拟合预测','Fitted prediction')],rows:xs.map((x,i)=>[round(x),round(ys[i]),round(predict(x))]),note:t('固定 10 个带噪声训练点；真实函数 sin(πx)。留出网格未参与拟合。微小 10⁻⁸ 数值正则用于求解稳定性；这是受控例子，不保证每次提高次数都会恶化泛化。','Ten fixed noisy training points from sin(πx); a separate clean grid is not fitted. A tiny 10⁻⁸ numerical ridge stabilizes the solver. This controlled example does not imply every increase in degree worsens generalization.'),series:test.map(predict)
    };
  }
  if(kind==='gradient-descent') {
    const rate=num(c,'rate'),scale=num(c,'scale');
    let w=0;
    const rows:(number|string)[][]=[];
    for(let step=0;
    step<=12;
    step++){
      rows.push([step,round(w),round(scale**2*(w-3)**2)]);
      if(step<12)w-=rate*2*scale**2*(w-3);
    }return{
      metrics:[metric('最终损失','Final loss',rows[12][2]),metric('稳定学习率上界（严格小于）','Stable learning-rate upper bound (strict)',round(1/scale**2))],columns:[t('更新次数','Updates'),t('权重 w','Weight w'),t('损失','Loss')],rows,note:t('目标 L=s²(w−3)²，梯度为 2s²(w−3)，最优 w=3。固定执行 12 次更新。尺度增大使稳定学习率范围缩小；高损失是数学发散，不是运行错误。','L=s²(w−3)², gradient 2s²(w−3), optimum w=3. Exactly 12 updates. Larger scale narrows the stable learning-rate range. Large loss reflects mathematical divergence, not a runtime error.'),series:rows.map(r=>Number(r[2]))
    };
  }
  if(kind==='classification'){
    const ps=[.05,.15,.25,.35,.45,.55,.65,.75,.85,.95],ys=[0,0,1,0,1,0,1,1,0,1];
    const r=confusion(ps,ys,num(c,'threshold'));
    return{
      metrics:[metric('TP / FP / TN / FN','TP / FP / TN / FN',`${r.tp} / ${r.fp} / ${r.tn} / ${r.fn}`),metric('精确率','Precision',r.precision === null ? '未定义 / undefined' : round(r.precision)),metric('召回率','Recall',r.recall === null ? '未定义 / undefined' : round(r.recall)),metric('错误代价 FP + cost×FN','Error cost FP + cost×FN',r.fp+num(c,'cost')*r.fn)],columns:[t('分数','Score'),t('真实标签','Label'),t('预测','Prediction')],rows:ps.map((p,i)=>[p,ys[i],p>=num(c,'threshold')?1:0]),note:t('固定分数并非已校准的概率。改变阈值不会重新训练模型。无预测阳性时精确率未定义；无真实阳性时召回率未定义。','Fixed scores are not calibrated probabilities. Moving the threshold does not retrain the model. Precision is undefined without predicted positives; recall is undefined without actual positives.')
    };
  }
  if(kind==='neural-network'){
    const inputs=[[0,0],[0,1],[1,0],[1,1]];
    const rows=inputs.map(([x,y])=>{
      const score=c.model==='relu'?Math.max(0,x-y)+Math.max(0,y-x):x+y;
      return[x,y,x===y?0:1,score,score>=num(c,'threshold')?1:0]
    });
    return{
      metrics:[metric('XOR 正确数 / 4','XOR correct / 4',rows.filter(r=>r[2]===r[4]).length)],columns:[t('x₁','x₁'),t('x₂','x₂'),t('XOR 标签','XOR label'),t('模型分数','Model score'),t('预测','Prediction')],rows,note:t('固定手工权重，不执行训练。两条隐藏通路是 ReLU(x₁−x₂) 与 ReLU(x₂−x₁)，相加得 |x₁−x₂|。非线性改变可表达的函数，但不保证真实任务表现。','Fixed hand-designed weights; no training. Hidden paths ReLU(x₁−x₂) and ReLU(x₂−x₁) sum to |x₁−x₂|. Nonlinearity changes expressivity, not a guarantee of real-world performance.')
    };
  }
  if(kind==='embeddings'){
    const vectors:Record<string,number[]>={
      cat:[1,.2,0],dog:[.9,.3,0],car:[0,.1,1],bus:[0,.2,.9]
    };
    const q=vectors[String(c.query)].map(x=>x*num(c,'magnitude'));
    const rows=Object.entries(vectors).map(([word,v])=>[word,round(cosine(q,v)),round(q.reduce((s,x,i)=>s+x*v[i],0))]).sort((a,b)=>Number(b[1])-Number(a[1]));
    return{
      metrics:[metric('查询向量','Query vector',q.map(round).join(', ')),metric('向量长度','Vector length',round(Math.hypot(...q)))],columns:[t('词','Word'),t('余弦相似度','Cosine similarity'),t('点积','Dot product')],rows,note:t('这是手工三维向量，不是训练得到的词嵌入。正数缩放改变点积而不改变余弦；相似度不等于事实正确性。','These are hand-designed 3D vectors, not learned embeddings. Positive scaling changes dot products but not cosine; similarity does not imply factual correctness.')
    };
  }
  if(kind==='attention'){
    const tokens=['The','cat','chased','mouse'];
    const scores=c.focus==='animal'?[0,2,.2,1.5]:[0,.2,2,.4];
    const allowed=c.mask==='on'?scores.slice(0,2):scores;
    const weights=softmax(allowed,num(c,'temperature'));
    const rows=tokens.map((token,i)=>[token,scores[i],i<weights.length?round(weights[i]):0]);
    return{
      metrics:[metric('权重总和','Weight sum',round(weights.reduce((a,b)=>a+b,0)))],columns:[t('词元','Token'),t('预设分数','Preset score'),t('归一化权重','Normalized weight')],rows,note:t('预设分数经 softmax，非训练注意力。开启掩码时第 2 位置只能读取前两个词元，后续权重为零。较高权重不是因果解释。','Preset scores pass through softmax; this is not trained attention. With the mask, query position 2 can read only the first two tokens. Later weights are zero. High attention weight is not a causal explanation.'),series:tokens.map((_,i)=>weights[i]||0)
    };
  }
  if(kind==='generation'){
    const tokens=['cat','dog','bird','car'],logits=[2,1.5,.5,0];
    const k=num(c,'topk'),ps=softmax(logits.slice(0,k),num(c,'temperature'));
    let seed=1729;
    const samples=Array.from({
      length:12
    },()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const u=seed/4294967296;
      let sum=0;
      for(let i=0;
      i<ps.length;
      i++){
        sum+=ps[i];
        if(u<sum)return tokens[i];
      }return tokens[k-1];
    });
    return{
      metrics:[metric('固定种子的 12 次采样','12 fixed-seed samples',samples.join(' · ')),metric('分布熵（nats）','Distribution entropy (nats)',round(-ps.reduce((s,p)=>s+(p?p*Math.log(p):0),0)))],columns:[t('候选','Candidate'),t('固定 logit','Fixed logit'),t('概率','Probability')],rows:tokens.map((token,i)=>[token,logits[i],round(ps[i]||0)]),note:t('固定四个候选，不运行语言模型。先保留最高 k 个分数，再除以温度并 softmax。每次使用相同随机种子以便比较；高温不等于更真实或更聪明。','Four fixed candidates, not a language model. Keep the top k logits, divide by temperature, then softmax. The seed is reset for comparisons; higher temperature is not greater truth or intelligence.'),series:tokens.map((_,i)=>ps[i]||0)
    };
  }
  if(kind==='rag'){
    const corpus=[{
      id:'D1',text:'library opening hours 09:00 18:00',answer:'09:00–18:00'
    },{
      id:'D2',text:'library books returns due 14 days',answer:'14 days / 14 天'
    },{
      id:'D3',text:'museum opening hours 10:00 17:00',answer:'10:00–17:00'
    }];
    const queries:Record<string,string[]>={
      opening:['library','opening','hours'],returns:['library','books','returns','due'],weather:['tomorrow','weather']
    };
    const q=queries[String(c.query)];
    const ranked=corpus.map(d=>({
      ...d,score:q.filter(w=>d.text.split(' ').includes(w)).length/q.length
    })).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    const retrieved=ranked.slice(0,num(c,'topk'));
    const accepted=retrieved.filter(d=>d.score>=num(c,'minimum'));
    const best=accepted[0];
    return{
      metrics:[metric('回答 / 引用','Answer / citation',best?`${best.answer} [${best.id}]`:'—'),metric('满足阈值的证据数','Evidence above threshold',accepted.length)],columns:[t('文档','Document'),t('固定语料','Fixed corpus'),t('词项覆盖分数','Query-term coverage'),t('已检索 (1=是)','Retrieved (1=yes)')],rows:ranked.map(d=>[d.id,d.text,round(d.score),retrieved.some(r=>r.id===d.id)?1:0]),note:t('使用英文固定词项匹配，非语义检索或生成模型。无证据时输出“—”（拒答），不编造答案；top-k 更大不保证相关性更高。','Fixed English term matching, not semantic retrieval or a generator. “—” means abstain without evidence. Increasing top-k does not guarantee greater relevance.')
    };
  }
  if(kind==='evaluation'){
    const hard=num(c,'hard'),rates=c.model==='specialist'?[.95,.45]:[.85,.8];
    return{
      metrics:[metric('混合总体准确率','Mixture accuracy',round((1-hard)*rates[0]+hard*rates[1])),metric('最差组准确率','Worst-group accuracy',Math.min(...rates)),metric('组间差距','Group gap',round(Math.abs(rates[0]-rates[1])))],columns:[t('场景组','Scenario group'),t('权重','Weight'),t('固定准确率','Fixed accuracy')],rows:[['Common / 常见',round(1-hard),rates[0]],['Hard / 困难',hard,rates[1]]],note:t('两组固定假设准确率，用加权平均计算总体指标；不是重新训练或真实模型测评。零权重组仍列出其假设表现，不把缺少样本当作安全证明。','Two assumed fixed group accuracies, combined by a weighted average. No retraining or real model evaluation. Zero-weight groups retain their assumed performance; absence of samples is not evidence of safety.')
    };
  }
  const cases=[{
    confidence:.95,correct:true
  },{
    confidence:.9,correct:false
  },{
    confidence:.85,correct:true
  },{
    confidence:.8,correct:true
  },{
    confidence:.75,correct:false
  },{
    confidence:.7,correct:true
  },{
    confidence:.65,correct:false
  },{
    confidence:.6,correct:true
  },{
    confidence:.55,correct:false
  },{
    confidence:.5,correct:true
  }];
  const automatic=cases.filter(x=>x.confidence>=num(c,'threshold'));
  const errors=automatic.filter(x=>!x.correct).length;
  return{
    metrics:[metric('自动处理覆盖率','Automatic coverage',automatic.length/cases.length),metric('自动错误数','Automatic errors',errors),metric('人工复核数','Human reviews',cases.length-automatic.length),metric('模拟代价：复核每项 1 + 自动错误','Toy cost: 1 per review + automatic errors',cases.length-automatic.length+errors*num(c,'cost'))],columns:[t('样本','Case'),t('置信度','Confidence'),t('原判断正确 (1=是)','Original decision correct (1=yes)'),t('自动处理 (1=是)','Automatic (1=yes)')],rows:cases.map((x,i)=>[i+1,x.confidence,x.correct?1:0,x.confidence>=num(c,'threshold')?1:0]),note:t('置信度可能很高但仍犯错。这里人为假设复核可以纠正所有错误且每项代价 1；现实复核也会失败。本实验不提供部署安全认证。','High confidence can still be wrong. We assume review corrects every error at cost 1 per case; real reviewers can fail. This experiment does not certify deployment safety.')
  };
}
