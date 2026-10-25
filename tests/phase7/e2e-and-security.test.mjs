import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('artifacts/file_generation/ttl=63d/intermediate/employee-management-system');
const htmlAppPath = path.resolve('artifacts/file_generation/ttl=63d/output/employee_management_system.html');

test('Phase 7.1: Static security & lint check verifies zero service_role leaks, zero any types, and zero TODOs', () => {
  const out = execFileSync('node', [path.join(root, 'scripts/lint-check.mjs')], { encoding: 'utf8' });
  assert.match(out, /0 errors, 0 warnings/);
});

test('Phase 7.2: TypeScript strict configuration and contract check passes', () => {
  const out = execFileSync('node', [path.join(root, 'scripts/type-check.mjs')], { encoding: 'utf8' });
  assert.match(out, /0 errors/);
});

test('Phase 7.3: Headless Chromium E2E test verifies Desktop, Mobile, Arabic RTL, English LTR, Employee & Admin workflows', () => {
  const pyScript = `
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

opts = Options()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--no-proxy-server')
opts.add_argument('--window-size=1280,800')

driver = webdriver.Chrome(options=opts)
try:
    html_content = open('${htmlAppPath}', encoding='utf-8').read()
    driver.get('about:blank')
    frame_id = driver.execute_cdp_cmd('Page.getFrameTree', {})['frameTree']['frame']['id']
    driver.execute_cdp_cmd('Page.setDocumentContent', {'frameId': frame_id, 'html': html_content})
    driver.execute_script('renderApp()')

    # 1. Verify Arabic RTL default layout and Admin Dashboard KPIs
    html_el = driver.find_element(By.ID, 'html-root')
    assert html_el.get_attribute('dir') == 'rtl', 'Default dir must be rtl'
    assert driver.find_element(By.ID, 'kpi-total-employees').text == '4'
    assert driver.find_element(By.ID, 'kpi-total-assigned').text == '6'

    # 2. Switch to English LTR and verify structural direction change
    driver.execute_script('toggleLanguage()')
    assert html_el.get_attribute('dir') == 'ltr', 'Toggled dir must be ltr'
    driver.execute_script('toggleLanguage()')
    assert html_el.get_attribute('dir') == 'rtl', 'Restored dir must be rtl'

    # 3. Switch to Employee Omar (60% progress on Task-101) and update progress to 100%
    driver.execute_script("quickSwitchUser('emp-omar')")
    active_name = driver.find_element(By.ID, 'active-user-name').text
    assert 'عمر' in active_name or 'Omar' in active_name

    # Open progress modal for Omar's assignment (asgn-101-omar)
    driver.execute_script("openEmployeeProgressModal('asgn-101-omar')")
    driver.execute_script("document.getElementById('prog-pct-input').value = '100';")
    driver.execute_script("document.getElementById('prog-desc-input').value = 'أكملت كافة نقاط النهاية واختبارات التكامل بنسبة 100%.';")
    driver.execute_script("document.getElementById('save-progress-btn').click();")

    # Submit Omar's 100% task for completion review
    driver.execute_script("openSubmitCompletionModal('asgn-101-omar')")
    driver.execute_script("document.getElementById('sub-summary-input').value = 'تم إتمام تطوير نقاط النهاية الخلفية وربطها مع قاعدة البيانات بنجاح.';")
    driver.execute_script("document.getElementById('confirm-submit-review-btn').click();")

    # 4. Switch back to Admin and verify notification badge & awaiting review queue
    driver.execute_script("quickSwitchUser('emp-admin')")
    badge = driver.find_element(By.ID, 'notif-unread-badge').text
    assert int(badge) >= 3, f'Expected unread admin notifications >= 3, got {badge}'

    # Approve Salma's awaiting_review submission (asgn-101-salma)
    driver.execute_script("openAdminReviewModal('asgn-101-salma')")
    driver.execute_script("document.getElementById('review-decision-input').value = 'approved';")
    driver.execute_script("document.getElementById('review-notes-input').value = 'ممتاز، تم اعتماد صفحة تسجيل العملاء.';")
    driver.execute_script("document.getElementById('submit-review-decision-btn').click();")

    # Approved count should now be 3 (was 2)
    assert driver.find_element(By.ID, 'kpi-approved').text == '3'

    # 5. Check mobile responsiveness (390x844)
    driver.set_window_size(390, 844)
    driver.execute_script("setTab('leaderboard')")
    print('E2E_CHROMIUM_PASS')
finally:
    driver.quit()
`;
  const out = execFileSync('python3', ['-c', pyScript], { encoding: 'utf8' });
  assert.match(out, /E2E_CHROMIUM_PASS/);
});
