// extension/src/content/site-detectors/glassdoor.js

export function extractGlassdoorJob() {
  const getTxt = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim().replace(/\s+/g, ' ') : null;
  };

  const jobTitle = getTxt('[data-test="jobTitle"]') ||
                   getTxt('.JobDetails_jobTitle__Rw_pt') ||
                   getTxt('h1');

  const company = getTxt('[data-test="employerName"]') ||
                  getTxt('.EmployerProfile_employerName__XemLi') ||
                  getTxt('.EmployerProfile_employerName');

  const location = getTxt('[data-test="location"]') ||
                   getTxt('.JobDetails_location__mSg5h');

  const description = getTxt('.JobDetails_jobDescription__uW_fK') ||
                      getTxt('[class*="jobDescription"]');

  return {
    platform: 'Glassdoor',
    jobTitle,
    company,
    location,
    description,
  };
}
