// extension/src/content/site-detectors/naukri.js

export function extractNaukriJob() {
  const getTxt = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim().replace(/\s+/g, ' ') : null;
  };

  const jobTitle = getTxt('.styles_jd-header-title__r2Aud') ||
                   getTxt('h1.jd-header-title') ||
                   getTxt('h1');

  const company = getTxt('.styles_jd-header-comp-name__M2BCall') ||
                  getTxt('.jd-header-comp-name a') ||
                  getTxt('.comp-name');

  const location = getTxt('.styles_jdn-location__y_l89') ||
                   getTxt('.location span');

  const salary = getTxt('.styles_jdn-salary__97b5f') ||
                 getTxt('.salary span');

  const description = getTxt('.styles_Jd-dscr-des__r2Aud') ||
                      getTxt('.job-desc');

  return {
    platform: 'Naukri',
    jobTitle,
    company,
    location,
    salary,
    description,
  };
}
