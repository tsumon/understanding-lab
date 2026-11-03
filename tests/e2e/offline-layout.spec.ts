import {test,expect} from '@playwright/test';
for (const locale of ['zh-CN', 'en'] as const) {
for (const width of [320, 390, 1280]) {
test(`offline status preserves an in-progress pointer click: ${locale} ${width}px`,async({page})=>{
 await page.setViewportSize({ width, height: 900 });
 await page.addInitScript(()=>{
  const sw=new EventTarget(); const worker=Object.assign(new EventTarget(),{state:'installed',postMessage(){}});
  const registration=Object.assign(new EventTarget(),{active:worker,waiting:null,installing:worker});
  Object.defineProperty(navigator,'serviceWorker',{value:Object.assign(sw,{controller:worker,register:async()=>registration,ready:Promise.resolve(registration)})});
  Object.assign(window,{__statusUpdate:()=>{sw.dispatchEvent(new MessageEvent('message',{data:{type:'CACHE_READY'}}));registration.dispatchEvent(new Event('updatefound'));(worker as unknown as EventTarget).dispatchEvent?.(new Event('statechange'));}});
  // Worker statechange is an actual EventTarget callback in the application.
 });
 await page.goto('/#legacy');
 await page.getByLabel('Language / 语言').selectOption(locale);
 // Natural wrapping, including enlarged text, must not be clipped.
 if (width === 320) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
 const start=page.getByRole('button',{name:locale === 'zh-CN' ? '开始学习' : 'Start learning'}); await expect(start).toBeVisible();
 await start.scrollIntoViewIfNeeded();
 const before=await start.boundingBox();expect(before).not.toBeNull();
 const x=before!.x+before!.width/2,y=before!.y+before!.height/2;
 await page.mouse.move(x,y);await page.mouse.down();
 await page.evaluate(()=>(window as unknown as {__statusUpdate:()=>void}).__statusUpdate());
 await expect(page.locator('.offline-update')).toBeVisible();
 const after=await start.boundingBox();expect(after!.y).toBeCloseTo(before!.y, 2);
 expect(after!.height).toBeCloseTo(before!.height, 2);
 expect(await page.locator('.offline-status').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
 await page.mouse.up();
 await expect(page.getByLabel(locale === 'zh-CN' ? '我的解释' : 'Your explanation')).toBeVisible();
});

}}
