import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {readingStatistics} from './Statistics';
describe('private reading statistics',()=>{
  it('uses only stored sessions and validates unique chapter completions',()=>{
    const refs=['65:1','65:1','67:1','0:1','19:151'];
    const result=readingStatistics([{date:'2026-11-07T12:00:00',words:100,ms:60000,averageWpm:200},{date:'2026-11-07T13:00:00',words:300,ms:120000,averageWpm:300}],refs,new Date('2026-11-07T15:00:00'));
    expect(result.words).toBe(400);expect(result.ms).toBe(180000);expect(result.averageWpm).toBe(275);
    expect(result.chapters).toBe(1);expect(result.completedBooks).toEqual(['Jude']);expect(result.days[6].count).toBe(2);expect(result.days[6].ms).toBe(180000);
  });
  it('keeps empty data empty and handles month boundaries without invented activity',()=>{
    const result=readingStatistics([],[],new Date('2027-01-02T12:00:00'));
    expect(result.days[0].date).toBe('2026-12-27');expect(result.words).toBe(0);expect(result.averageWpm).toBe(0);expect(result.percentage).toBe(0);expect(result.days.every(day=>day.count===0&&day.ms===0)).toBe(true);
  });
});
