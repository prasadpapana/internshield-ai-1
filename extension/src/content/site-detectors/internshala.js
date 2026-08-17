// extension/src/content/site-detectors/internshala.js

export function extractInternshalaJob() {
  const getTxt = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim().replace(/\s+/g, ' ') : null;
  };

  const jobTitle = getTxt('.heading_4_5.profile') ||
                   getTxt('.profile') ||
                   getTxt('h1');

  const company = getTxt('.heading_6.company_name') ||
                  getTxt('.company_name a') ||
                  getTxt('.company_name');

  const location = getTxt('#location_names span') ||
                   getTxt('.location_link');

  const stipend = getTxt('.stipend') ||
                  getTxt('.stipend_container');

  const description = getTxt('#details_container') ||
                      getTxt('.text-container') ||
                      getTxt('.internship_details');

  return {
    platform: 'Internshala',
    jobTitle,
    company,
    location,
    salary: stipend,
    description,
  };
}
