// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CourseRoot } from '../../src/course/CourseRoot';
import { chapters } from '../../src/course/curriculum';
import { COURSE_STORAGE_KEY } from '../../src/course/progress';

beforeEach(()=>{localStorage.clear();window.location.hash=`#course/${chapters[0].id}`;});
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();window.location.hash='';});
const leaving = () => {const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;};

test('normal persisted course edits do not warn on unload, but failed writes preserve work and warn',()=>{
  render(<CourseRoot/>);
  expect(leaving()).toBe(false);
  const input=screen.getByRole('textbox',{name:chapters[0].content['zh-CN'].transfer.prompt});
  fireEvent.change(input,{target:{value:'A safely saved response before quota failure'}});
  expect(leaving()).toBe(false);
  const original=Storage.prototype.setItem;
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){if(key===COURSE_STORAGE_KEY)throw new Error('quota');original.call(this,key,value);});
  fireEvent.change(input,{target:{value:'Unpersisted response that must remain exportable'}});
  expect(input).toHaveProperty('value','Unpersisted response that must remain exportable');
  expect(leaving()).toBe(true);
  vi.restoreAllMocks();
  fireEvent.click(screen.getByRole('button',{name:'重试保存'}));
  expect(leaving()).toBe(false);
});

test('detected external changes warn before unloading an unmerged course record',()=>{
  render(<CourseRoot/>);
  fireEvent(window,new StorageEvent('storage',{key:COURSE_STORAGE_KEY,newValue:'changed'}));
  expect(leaving()).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'重新载入记录'}));
  expect(leaving()).toBe(false);
});
