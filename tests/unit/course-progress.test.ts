import { describe, expect, it } from 'vitest';
import { completionRequirements, emptyChapter, emptyProgress, parseProgress, writeProgress, COURSE_STORAGE_KEY } from '../../src/course/progress';
import type { CourseChapter } from '../../src/course/types';
const question = { id: 'q', question: '?', options: [{ id: 'a', text: 'A', feedback: 'yes' }, { id: 'b', text: 'B', feedback: 'no' }], correctId: 'a' };
const content = { title:'Test', summary:'', objectives:[], explanation:[], misconception:{claim:'',correction:''}, prediction:question, experiment:{prompt:'',steps:[],interpretation:'',limitation:''}, transfer:{prompt:'',rubric:[],sampleAnswer:''}, quiz:[question], reflection:[],glossary:[],sources:[] };
const chapter: CourseChapter = {id:'first',order:1,prerequisites:[],minutes:20,experimentKind:'regression',content:{en:content,'zh-CN':content}};
describe('course progress contract',()=>{
  it('starts empty without mutating legacy data',()=>{expect(parseProgress(null)).toEqual(emptyProgress());});
  it('roundtrips separate chapter evidence and unknown chapter entries without dropping data',()=>{
    const data={...emptyProgress(),retainedMetadata:{note:'preserve'},lastChapter:'future',chapters:{first:{...emptyChapter(),transfer:'first'},future:{...emptyChapter(),reflection:'preserved'}}};
    expect(parseProgress(JSON.stringify(data))).toEqual(data);
  });
  it.each(['{','null','[]','{"schemaVersion":2,"chapters":{}}','{"schemaVersion":1,"chapters":null}','{"schemaVersion":1,"chapters":{"x":{}}}'])('rejects unsupported or malformed raw data without creating replacement: %s',raw=>{expect(()=>parseProgress(raw)).toThrow();});
  it('rejects malformed optional timestamps',()=>{
    expect(()=>parseProgress(JSON.stringify({...emptyProgress(),chapters:{first:{...emptyChapter(),updatedAt:12}}}))).toThrow();
    expect(()=>parseProgress(JSON.stringify({...emptyProgress(),chapters:{first:{...emptyChapter(),completedAt:'not a date'}}}))).toThrow();
  });
  it('rejects malformed experiment evidence',()=>{
    expect(()=>parseProgress(JSON.stringify({...emptyProgress(),chapters:{first:{...emptyChapter(),experiment:{config:{x:null},runs:[]}}}}))).toThrow();
  });
  it('requires all five kinds of evidence, not button clicks',()=>{
    expect(Object.values(completionRequirements(chapter,'en',emptyChapter(),false))).toEqual([false,false,false,false,false]);
    const p={...emptyChapter(),prediction:'b',transfer:'a substantive transfer response',reflection:'a substantive reflection response',answers:{q:'a'}};
    expect(Object.values(completionRequirements(chapter,'en',p,true)).every(Boolean)).toBe(true);
    expect(completionRequirements(chapter,'en',{...p,answers:{q:'b'}},true).quiz).toBe(false);
    expect(completionRequirements(chapter,'en',{...p,transfer:'                    '},true).transfer).toBe(false);
    expect(completionRequirements(chapter,'en',{...p,prediction:'bogus'},true).prediction).toBe(false);
    expect(completionRequirements(chapter,'en',p,false).experiment).toBe(false);
  });
  it('does not share answer objects between fresh chapters',()=>{const a=emptyChapter(),b=emptyChapter();a.answers.q='a';expect(b.answers).toEqual({});});
});

describe('optimistic course record writes',()=>{
  it('detects another tab write even before any storage event is delivered',()=>{
    const remote = JSON.stringify({...emptyProgress(),lastChapter:'remote'});
    let raw: string | null = remote;
    const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
    expect(writeProgress(storage,null,emptyProgress())).toEqual({status:'conflict'});
    expect(raw).toBe(remote);
  });
  it('writes only when the last-read snapshot still matches',()=>{
    let raw: string | null = null; let key='';
    const storage={getItem:()=>raw,setItem:(k:string,value:string)=>{key=k;raw=value;}};
    const result=writeProgress(storage,null,emptyProgress());
    expect(result.status).toBe('saved');expect(raw).toBe(JSON.stringify(emptyProgress()));expect(key).toBe(COURSE_STORAGE_KEY);
  });
  it('does not swallow storage errors or pretend a write succeeded',()=>{
    const storage={getItem:()=>null,setItem:()=>{throw new Error('quota');}};
    expect(()=>writeProgress(storage,null,emptyProgress())).toThrow('quota');
  });
});
