import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {chronologicalPlan} from './plans';
const source=JSON.parse(readFileSync(new URL('../public/plans/chronological.json',import.meta.url),'utf8'));
describe('verified chronological reading source',()=>{
  it('retains every publisher day in its original order with complete coverage',()=>{
    const plan=chronologicalPlan(source);
    expect(plan.days).toHaveLength(365);
    expect(plan.days.flat()).toHaveLength(1189);
    expect(plan.days).toEqual(source.assignments.map(day=>day.chapters));
    expect(plan.days[3][0]).toEqual({book:18,chapter:1});
    expect(plan.source.url).toBe('https://www.blueletterbible.org/assets/pdf/dbrp/1Yr_ChronologicalPlan.pdf');
    expect(plan.source.sha256).toBe('b055f5f4a14d86fb876237937478374de7c6811cdb70f951dc178dbd09e7fe54');
  });
  it('rejects damaged schedules, duplicate chapters, and missing provenance',()=>{
    expect(()=>chronologicalPlan({...source,assignments:source.assignments.slice(1)})).toThrow();
    const duplicate=structuredClone(source);duplicate.assignments[0].chapters[0]={book:1,chapter:2};
    expect(()=>chronologicalPlan(duplicate)).toThrow();
    expect(()=>chronologicalPlan({...source,sourceSha256:''})).toThrow();
  });
});
