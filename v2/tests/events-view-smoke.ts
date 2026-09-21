import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
const origin=process.env.PRISM_V2_URL
if(!origin||!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)||origin==='http://127.0.0.1:4336')throw Error('Use an explicit isolated offline preview URL')
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}})
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
try{
  const response=await page.request.get(`${origin}/api/events`),model=await response.json()
  expect(model.contractVersion).toBe('portfolio-events/1');expect(model.events.length).toBeGreaterThan(0)
  await page.goto(`${origin}/#/events`)
  await expect(page.getByRole('heading',{name:'Transactions & cash movements'})).toBeVisible()
  await expect(page.getByText(`${model.events.length} saved events`,{exact:true})).toBeVisible()
  const reconciliation=page.getByRole('heading',{name:'Reconciliation with saved observations'}).locator('..')
  await expect(reconciliation.locator('.history-position')).toHaveCount(model.reconciliation.rows.length)
  await page.getByLabel('Show',{exact:false}).selectOption('unresolved')
  await expect(page.locator('.events-view .history-position').first()).toContainText('unresolved')
  await page.getByLabel('Show',{exact:false}).selectOption('executed')
  await page.locator('.events-view .history-position').first().getByText(/Evidence, exact values/).click()
  await expect(page.locator('.events-view .history-position').first()).toContainText('Exact net cash:')
  await page.reload()
  await expect(page.getByText(`${model.events.length} saved events`,{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Continue primary history',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Connect on Portfolio')
  mkdirSync('test-results/dev276-events',{recursive:true})
  await page.screenshot({path:'test-results/dev276-events/events-desktop.png',fullPage:false})
  await page.setViewportSize({width:390,height:844})
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
  await page.screenshot({path:'test-results/dev276-events/events-mobile.png',fullPage:false})
  await page.getByRole('button',{name:'Reload saved events'}).focus()
  await expect(page.getByRole('button',{name:'Reload saved events'})).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText(`${model.events.length} saved events`,{exact:true})).toBeVisible()
  let reply:unknown={...model,events:[],totals:[{currency:'EUR',purchases:'0',sales:'0',cashAdded:'0',cashWithdrawn:'0',income:'0',spending:'0',internalTransfers:0,netCashMovement:'0'}]}
  await page.route('**/api/events',route=>route.fulfill({status:200,json:reply}))
  await page.getByRole('button',{name:'Reload saved events'}).click()
  await expect(page.getByText('Net observed cash movement',{exact:true})).toBeVisible()
  await expect(page.getByText('No supported cash movements yet. Missing amounts are unknown.',{exact:true})).toHaveCount(0)
  for(const outcome of ['succeeded','partial','failed','cancelled']){
    let diagnostics=0
    await page.route('**/api/events/backfill',route=>route.fulfill({status:202,json:{accepted:true,attemptId:'synthetic-batch'}}))
    await page.route('**/api/diagnostics',route=>route.fulfill({status:200,json:{events:++diagnostics===1?[{attemptId:'unrelated',event:'succeeded',terminal:true}]:[{attemptId:'synthetic-batch',event:outcome,terminal:true}]}}))
    reply={...model,events:model.events.slice(0,1)}
    await page.getByRole('button',{name:'Continue primary history',exact:true}).click()
    await expect(page.getByRole('button',{name:'Reading history…'})).toBeDisabled()
    await expect(page.getByText('1 saved events',{exact:true})).toBeVisible()
    await expect(page.getByRole('status')).toContainText(outcome==='succeeded'?'completed':outcome==='partial'?'partial results':outcome==='cancelled'?'cancelled':'failed')
    expect(diagnostics).toBe(2)
    await page.getByRole('button',{name:'Reload saved events'}).click()
    await expect(page.getByRole('status')).toHaveCount(0)
  }
  reply={contractVersion:'unsupported/1'}
  await page.getByRole('button',{name:'Reload saved events'}).click()
  await expect(page.getByRole('alert')).toContainText('incompatible')
  expect(errors).toEqual([])
  const report={events:model.events.length,automaticCompletionOutcomes:4,reload:true,filters:true,exactDisclosure:true,offlineBackfillRejected:true,narrowOverflow:false,keyboard:true,knownZeroCurrencyVisible:true,incompatibleResponseRejected:true,pageErrors:errors.length}
  writeFileSync('test-results/dev276-events/browser-report.json',JSON.stringify(report,null,2),{mode:0o600})
  console.log(JSON.stringify(report))
}finally{await browser.close()}
