// extension/src/content/site-detectors/indeed.js

export function extractIndeedJob() {
  const getTxt = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim().replace(/\s+/g, ' ') : null;
  };

  const jobTitle = getTxt('[data-testid="jobsearch-JobInfoHeader-title"]') ||
                   getTxt('.jobsearch-JobInfoHeader-title') ||
                   getTxt('h1');

  const company = getTxt('[data-testid="inlineHeader-companyName"]') ||
                  getTxt('.jobsearch-InlineCompanyRating div') ||
                  getTxt('[data-company-name="true"]');

  const location = getTxt('[data-testid="inlineHeader-companyLocation"]') ||
                   getTxt('.jobsearch-JobInfoHeader-subtitle div');

  const salary = getTxt('#salaryInfoAndJobType') ||
                 getTxt('[data-testid="attribute_snippet_testid"]');

  const description = getTxt('#jobDescriptionText') ||
                      getTxt('.jobsearch-JobComponent-description');

  return {
    platform: 'Indeed',
    jobTitle,
    company,
    location,
    salary,
    description,
  };
}
