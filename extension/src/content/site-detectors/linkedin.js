// extension/src/content/site-detectors/linkedin.js

export function extractLinkedInJob() {
  const getTxt = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim().replace(/\s+/g, ' ') : null;
  };

  const jobTitle = getTxt('.job-details-jobs-unified-top-card__job-title') ||
                   getTxt('.jobs-unified-top-card__job-title') ||
                   getTxt('h1.t-24') ||
                   getTxt('h1');

  const company = getTxt('.job-details-jobs-unified-top-card__company-name') ||
                  getTxt('.jobs-unified-top-card__company-name') ||
                  getTxt('.jobs-unified-top-card__subtitle-primary-grouping a');

  const location = getTxt('.job-details-jobs-unified-top-card__bullet') ||
                   getTxt('.jobs-unified-top-card__bullet');

  const recruiter = getTxt('.jobs-poster__name') ||
                    getTxt('.hirer-card__name');

  const description = getTxt('#job-details') ||
                      getTxt('.jobs-description-content') ||
                      getTxt('.jobs-description__container');

  return {
    platform: 'LinkedIn',
    jobTitle,
    company,
    location,
    recruiter,
    description,
  };
}
