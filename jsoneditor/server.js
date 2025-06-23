const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// --- Configuration ---
// Port: Uses process.env.PORT (for Heroku/PaaS), then APP_PORT, then falls back to 8082
const port = parseInt(process.env.PORT || process.env['APP_PORT'] || '8082');
// App Name: Used as a URL prefix, e.g., /design/
const appName = process.env['APP_NAME'] || 'design'; // Default set to 'design'

const app = express();

// Set EJS as the view engine and specify views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the 'static' directory (for CSS, client-side JS etc.)
app.use(`/${appName}/`, express.static(path.join(__dirname, 'static')));

// Middleware for parsing request bodies (JSON and URL-encoded forms)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Path to the main data file
const DATA_FILE = path.join(__dirname, 'data', 'mydata.json');

// --- Initial Setup: Ensure necessary directories and data file exist ---
['data', 'uploads'].forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
});

// Ensure mydata.json exists and is a valid JSON array. If not, create/reset it.
try {
    const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
    const parsedContent = JSON.parse(fileContent);
    if (!Array.isArray(parsedContent)) {
        fs.writeFileSync(DATA_FILE, '[]', 'utf8');
    }
} catch (error) {
    // If file doesn't exist (ENOENT) or is invalid JSON (SyntaxError), create it as an empty array
    if (error.code === 'ENOENT' || error instanceof SyntaxError) {
        fs.writeFileSync(DATA_FILE, '[]', 'utf8');
    } else {
        console.error("Error checking/initializing data file:", error);
    }
}

// Multer setup for handling file uploads (e.g., for JSON data import)
const upload = multer({ dest: 'uploads/' });

// --- Helper Functions for Data Management and Parsing ---

// Reads the entire data file, parses it, and returns the array
const readData = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading data file:", error.message);
        return [];
    }
};

// Writes the given data array back to the data file, formatted with 2-space indentation
const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Error writing data file:", error.message);
    }
};

// Parses a comma-separated string into an array of trimmed strings
const parseStringToArray = (str) => {
    return str ? str.split(',').map(s => s.trim()).filter(s => s !== '') : [];
};

// Parses dynamic form fields for generic KVP (key-value pairs like contacts, observability)
const parseKVP = (body, prefix = '') => {
    const items = [];
    let i = 0;
    while (body[`${prefix}key_${i}`] || body[`${prefix}value_${i}`]) {
        items.push({
            key: body[`${prefix}key_${i}`] || '',
            value: body[`${prefix}value_${i}`] || ''
        });
        i++;
    }
    return items;
};

// Parses dynamic form fields for flag links (e.g., arr_link_0, risk_link_0)
const parseFlagLinks = (body, prefix = '') => {
    const links = [];
    let i = 0;
    while (body[`${prefix}link_${i}`]) {
        links.push({
            link: body[`${prefix}link_${i}`] || ''
        });
        i++;
    }
    return links;
};


// Parses dynamic form fields for deployment locations (e.g., deployment_site_0, deployment_zone_0, deployment_country_0)
const parseDeploymentLocations = (body, prefix = 'deployment_') => {
    const locations = [];
    let i = 0;
    // Check for any part of a location row to determine if it exists
    while (body[`${prefix}site_${i}`] || body[`${prefix}zone_${i}`] || body[`${prefix}segment_${i}`] || body[`${prefix}country_${i}`]) {
        locations.push({
            site: body[`${prefix}site_${i}`] || '',
            zone: body[`${prefix}zone_${i}`] || '',
            segment: body[`${prefix}segment_${i}`] || '',
            country: body[`${prefix}country_${i}`] || '' // NEW: Capture country
        });
        i++;
    }
    return locations;
};

// Parses dynamic form fields for customer options (e.g., option_name_0, config_pseudocode_0)
const parseCustomerOptions = (body, prefix = 'option_') => {
    const options = [];
    let i = 0;
    while (body[`${prefix}name_${i}`] || body[`config_pseudocode_${i}`]) {
        options.push({
            option_name: body[`${prefix}name_${i}`] || '',
            config_block_pseudocode: body[`config_pseudocode_${i}`] || ''
        });
        i++;
    }
    return options;
};


// --- Query/Search Logic: Filters the loaded data based on query parameters ---
// Refactored to search across all top-level types and their nested structures
const filterData = (query) => {
    let allData = readData();
    let results = [];

    // Deep clone all data to allow modification for filtering (e.g., removing non-matching versions)
    const allEntities = JSON.parse(JSON.stringify(allData));

    allEntities.forEach(entity => {
        let entityMatch = false; // Tracks if the top-level entity itself matches any direct query

        // --- Filter Categories ---
        if (entity.type === "Category") {
            // Apply category-level filters
            if (query.categoryName && entity.name.toLowerCase().includes(query.categoryName.toLowerCase())) {
                entityMatch = true;
            }
            if (query.categoryStatus && entity.status.toLowerCase() === query.categoryStatus.toLowerCase()) {
                entityMatch = true;
            }
            // General text search for Category (name, rationale, links, KVP values, library tags)
            const categorySearchableText = `${entity.name || ''} ${entity.rationale || ''} ${entity.status || ''} ` +
                                          `${entity.governance_record_link || ''} ${entity.topology_view_link || ''} ` +
                                          `${entity.roadmap_link || ''} ${entity.fsa_link || ''} ` +
                                          (entity.guidelines_library_tags ? entity.guidelines_library_tags.join(' ') : '') + ' ' +
                                          (entity.controls_alignments_library_tags ? entity.controls_alignments_library_tags.join(' ') : '') + ' ' +
                                          (entity.standards_library_tags ? entity.standards_library_tags.join(' ') : '') + ' ' +
                                          (entity.fsa_library_tags ? entity.fsa_library_tags.join(' ') : '') + ' ' +
                                          (entity.observability_kvp ? entity.observability_kvp.map(k => k.key + ' ' + k.value).join(' ') : '') + ' ' +
                                          (entity.contacts_kvp ? entity.contacts_kvp.map(k => k.key + ' ' + k.value).join(' ') : '');

            if (query.keyword && categorySearchableText.toLowerCase().includes(query.keyword.toLowerCase())) {
                entityMatch = true;
            }
            if (query.searchText && categorySearchableText.toLowerCase().includes(query.searchText.toLowerCase())) {
                entityMatch = true;
            }


            // Temporarily store filtered children for this category
            const filteredComponentsForCategory = [];
            const filteredCustomerOptionsForCategory = [];

            // --- Filter Components associated with this Category ---
            allEntities.filter(item => item.type === "Component" && item.category_id === entity.id).forEach(component => {
                let componentMatch = false;
                const componentFilteredVersions = [];

                // Apply component-level filters
                if (query.componentName && component.name.toLowerCase().includes(query.componentName.toLowerCase())) {
                    componentMatch = true;
                }
                if (query.componentType && component.component_type.toLowerCase() === query.componentType.toLowerCase()) {
                    componentMatch = true;
                }
                if (query.componentLabel && component.component_label.toLowerCase() === query.componentLabel.toLowerCase()) {
                    componentMatch = true;
                }
                // Check ARR/Risk flags
                if (query.arrFlag === 'true' && component.arr_flags && component.arr_flags.length > 0) { // 'true' as string from query
                    componentMatch = true;
                }
                if (query.riskFlag === 'true' && component.risk_flags && component.risk_flags.length > 0) { // 'true' as string from query
                    componentMatch = true;
                }
                // General text search for Component (name, description, label)
                const componentSearchableText = `${component.name || ''} ${component.description || ''} ${component.component_type || ''} ${component.component_label || ''}`;
                if (query.keyword && componentSearchableText.toLowerCase().includes(query.keyword.toLowerCase())) {
                    componentMatch = true;
                }
                if (query.searchText && componentSearchableText.toLowerCase().includes(query.searchText.toLowerCase())) {
                    componentMatch = true;
                }


                // Filter its component_versions
                component.component_versions.forEach(version => {
                    let versionMatch = false;

                    // Apply version-level filters
                    if (query.version && version.version.toLowerCase().includes(query.version.toLowerCase())) {
                        versionMatch = true;
                    }
                    if (query.lifecycleStatus && version.lifecycle_status.toLowerCase() === query.lifecycleStatus.toLowerCase()) {
                        versionMatch = true;
                    }
                    if (query.governanceStatus && version.governance && version.governance.status.toLowerCase() === query.governanceStatus.toLowerCase()) {
                        versionMatch = true;
                    }

                    // Version-specific text search
                    const versionSearchableText = `${version.version || ''} ${version.lifecycle_status || ''} ${version.governance?.status || ''} ` +
                                                  `${version.topology_diagram_link || ''} ${version.operational_guidelines_link || ''} ${version.base_config_source_link || ''} ` +
                                                  (version.standards_tags ? version.standards_tags.join(' ') : '') + ' ' +
                                                  (version.supported_capabilities ? version.supported_capabilities.join(' ') : '') + ' ' +
                                                  (version.deployment_locations ? version.deployment_locations.map(loc => `${loc.site || ''} ${loc.zone || ''} ${loc.segment || ''} ${loc.country || ''}`).join(' ') : '') + ' ' + // NEW: Include country in search text
                                                  (version.observability_links ? version.observability_links.map(link => link.key + ' ' + link.value).join(' ') : '');

                    if (query.keyword && versionSearchableText.toLowerCase().includes(query.keyword.toLowerCase())) {
                        versionMatch = true;
                    }
                    if (query.searchText && versionSearchableText.toLowerCase().includes(query.searchText.toLowerCase())) {
                        versionMatch = true;
                    }


                    // Filter by specific tags/capabilities/locations/observability
                    if (query.standardsTag && version.standards_tags && version.standards_tags.some(tag => tag.toLowerCase().includes(query.standardsTag.toLowerCase()))) {
                        versionMatch = true;
                    }
                    if (query.capability && version.supported_capabilities && version.supported_capabilities.some(cap => cap.toLowerCase().includes(query.capability.toLowerCase()))) {
                        versionMatch = true;
                    }
                    // Filter by deployment_locations (site, zone, segment, country)
                    if (query.site || query.zone || query.segment || query.country) { // NEW: Add query.country
                        if (version.deployment_locations && version.deployment_locations.some(loc => {
                            const siteMatch = query.site ? loc.site.toLowerCase().includes(query.site.toLowerCase()) : true;
                            const zoneMatch = query.zone ? loc.zone.toLowerCase().includes(query.zone.toLowerCase()) : true;
                            const segmentMatch = query.segment ? loc.segment.toLowerCase().includes(query.segment.toLowerCase()) : true;
                            const countryMatch = query.country ? loc.country.toLowerCase().includes(query.country.toLowerCase()) : true; // NEW: Match country
                            return siteMatch && zoneMatch && segmentMatch && countryMatch; // NEW: Include country in full match
                        })) {
                            versionMatch = true;
                        }
                    }
                    if ((query.obsKey || query.obsValue) && version.observability_links && version.observability_links.some(link => {
                        const keyMatch = query.obsKey ? link.key.toLowerCase().includes(query.obsKey.toLowerCase()) : true;
                        const valueMatch = query.obsValue ? link.value.toLowerCase().includes(query.obsValue.toLowerCase()) : true;
                        return keyMatch && valueMatch;
                    })) {
                        versionMatch = true;
                    }


                    if (versionMatch) {
                        componentFilteredVersions.push(version);
                        componentMatch = true; // Component matches if any of its versions match
                        entityMatch = true;    // Category matches if any of its components/versions match
                    }
                });

                // If component (or any of its versions) matches, add it to the filtered results
                if (componentFilteredVersions.length > 0 || (componentMatch && Object.keys(query).every(k => !['version', 'lifecycleStatus', 'governanceStatus', 'searchText', 'standardsTag', 'capability', 'site', 'zone', 'segment', 'country', 'obsKey', 'obsValue'].includes(k)))) { // NEW: Add country to key check
                    const clonedComponent = { ...component, component_versions: componentFilteredVersions };
                    filteredComponentsForCategory.push(clonedComponent);
                    entityMatch = true; // Category matches if an associated component matches
                }
            });


            // --- Filter Customer Option Sets associated with this Category ---
            allEntities.filter(item => item.type === "CustomerOptionSet" && item.category_id === entity.id).forEach(optionSet => {
                let optionSetMatch = false;

                // Apply customer option set filters
                if (query.customerName && optionSet.customer_name.toLowerCase().includes(query.customerName.toLowerCase())) {
                    optionSetMatch = true;
                }
                if (query.customerOptionVersion && optionSet.customer_option_version.toLowerCase().includes(query.customerOptionVersion.toLowerCase())) {
                    optionSetMatch = true;
                }
                if (query.customerLifecycleStatus && optionSet.lifecycle_status.toLowerCase() === query.customerLifecycleStatus.toLowerCase()) {
                    optionSetMatch = true;
                }
                if (query.customerGovernanceStatus && optionSet.governance && optionSet.governance.status.toLowerCase() === query.customerGovernanceStatus.toLowerCase()) {
                    optionSetMatch = true;
                }
                if (query.customerCapabilityRequired) {
                    const searchCap = query.customerCapabilityRequired.toLowerCase();
                    if (optionSet.capabilities_required && optionSet.capabilities_required.some(cap => cap.toLowerCase().includes(searchCap))) {
                        optionSetMatch = true;
                    }
                }
                if (query.optionName) {
                    const searchOptName = query.optionName.toLowerCase();
                    if (optionSet.options && optionSet.options.some(opt => opt.option_name.toLowerCase().includes(searchOptName))) {
                        optionSetMatch = true;
                    }
                }
                if (query.pseudocodeKeyword) {
                    const searchPseudo = query.pseudocodeKeyword.toLowerCase();
                    if (optionSet.options && optionSet.options.some(opt => opt.config_block_pseudocode && opt.config_block_pseudocode.toLowerCase().includes(searchPseudo))) {
                        optionSetMatch = true;
                    }
                }
                 // General text search for Customer Option Set
                const optionSetSearchableText = `${optionSet.customer_name || ''} ${optionSet.guidance_rationale || ''} ` +
                                                (optionSet.capabilities_required ? optionSet.capabilities_required.join(' ') : '') + ' ' +
                                                (optionSet.options ? optionSet.options.map(o => o.option_name + ' ' + o.config_block_pseudocode).join(' ') : '');
                if (query.keyword && optionSetSearchableText.toLowerCase().includes(query.keyword.toLowerCase())) {
                    optionSetMatch = true;
                }
                if (query.searchText && optionSetSearchableText.toLowerCase().includes(query.searchText.toLowerCase())) {
                    optionSetMatch = true;
                }


                if (optionSetMatch) {
                    filteredCustomerOptionsForCategory.push(optionSet); // Add the entire matching option set
                    entityMatch = true; // Category matches if an associated customer option set matches
                }
            });


            // Add Category to final results if it or any of its associated components/customer options matched
            // If only category-level query params are present, just match the category itself.
            // This logic is designed to return a category if it matches a category-level query OR if any of its children match a child-level query.
            const hasCategorySpecificQueries = Object.keys(query).some(k => ['categoryName', 'categoryStatus'].includes(k));
            const hasChildSpecificQueries = Object.keys(query).some(k =>
                ['componentName', 'componentType', 'componentLabel', 'version', 'lifecycleStatus', 'governanceStatus', 'searchText', 'standardsTag', 'capability', 'site', 'zone', 'segment', 'country', 'obsKey', 'obsValue', 'keyword', 'arrFlag', 'riskFlag', 'customerName', 'customerOptionVersion', 'customerLifecycleStatus', 'customerGovernanceStatus', 'customerCapabilityRequired', 'optionName', 'pseudocodeKeyword'].includes(k) // NEW: Add country to child queries
            );

            if (entityMatch || (hasCategorySpecificQueries && !hasChildSpecificQueries)) { // Match if entity itself matched OR if category-specific query used without child query
                const clonedCategory = {
                    ...entity,
                    components: filteredComponentsForCategory, // Attach filtered components
                    customer_options: filteredCustomerOptionsForCategory // Attach filtered customer options
                };
                results.push(clonedCategory);
            }
        }
        // --- End Filter Categories ---

        // --- Filter Components (top-level, if not already included via Category filter or no category query) ---
        // This ensures components are returned directly if they match a component-specific query
        // AND are not already included because their category matched.
        if (entity.type === "Component" && (!query.categoryName && !query.categoryStatus)) {
            let componentMatchDirect = false;
            const componentFilteredVersions = [];

             // Apply component-level filters (similar to above but for direct match)
            if (query.componentName && entity.name.toLowerCase().includes(query.componentName.toLowerCase())) { componentMatchDirect = true; }
            if (query.componentType && entity.component_type.toLowerCase() === query.componentType.toLowerCase()) { componentMatchDirect = true; }
            if (query.componentLabel && entity.component_label.toLowerCase() === query.componentLabel.toLowerCase()) { componentMatchDirect = true; }
            if (query.arrFlag === 'true' && entity.arr_flags && entity.arr_flags.length > 0) { componentMatchDirect = true; }
            if (query.riskFlag === 'true' && entity.risk_flags && entity.risk_flags.length > 0) { componentMatchDirect = true; }
            const componentSearchableText = `${entity.name || ''} ${entity.description || ''} ${entity.component_type || ''} ${entity.component_label || ''}`;
            if (query.keyword && componentSearchableText.toLowerCase().includes(query.keyword.toLowerCase())) { componentMatchDirect = true; }
            if (query.searchText && componentSearchableText.toLowerCase().includes(query.searchText.toLowerCase())) { componentMatchDirect = true; }


            entity.component_versions.forEach(version => {
                let versionMatch = false;
                if (query.version && version.version.toLowerCase().includes(query.version.toLowerCase())) { versionMatch = true; }
                if (query.lifecycleStatus && version.lifecycle_status.toLowerCase() === query.lifecycleStatus.toLowerCase()) { versionMatch = true; }
                if (query.governanceStatus && version.governance && version.governance.status.toLowerCase() === query.governanceStatus.toLowerCase()) { versionMatch = true; }
                const versionSearchableText = `${version.version || ''} ${version.lifecycle_status || ''} ${version.governance?.status || ''} ` +
                                              `${version.topology_diagram_link || ''} ${version.operational_guidelines_link || ''} ${version.base_config_source_link || ''} ` +
                                              (version.standards_tags ? version.standards_tags.join(' ') : '') + ' ' +
                                              (version.supported_capabilities ? version.supported_capabilities.join(' ') : '') + ' ' +
                                              (version.deployment_locations ? version.deployment_locations.map(loc => `${loc.site || ''} ${loc.zone || ''} ${loc.segment || ''} ${loc.country || ''}`).join(' ') : '') + ' ' + // NEW: Include country in search text
                                              (version.observability_links ? version.observability_links.map(link => link.key + ' ' + link.value).join(' ') : '');
                if (query.keyword && versionSearchableText.toLowerCase().includes(query.keyword.toLowerCase())) { versionMatch = true; }
                if (query.searchText && versionSearchableText.toLowerCase().includes(query.searchText.toLowerCase())) { versionMatch = true; }
                if (query.standardsTag && version.standards_tags && version.standards_tags.some(tag => tag.toLowerCase().includes(query.standardsTag.toLowerCase()))) { versionMatch = true; }
                if (query.capability && version.supported_capabilities && version.supported_capabilities.some(cap => cap.toLowerCase().includes(query.capability.toLowerCase()))) { versionMatch = true; }
                if ((query.site || query.zone || query.segment || query.country) && version.deployment_locations && version.deployment_locations.some(loc => { // NEW: Add query.country
                    const siteMatch = query.site ? loc.site.toLowerCase().includes(query.site.toLowerCase()) : true;
                    const zoneMatch = query.zone ? loc.zone.toLowerCase().includes(query.zone.toLowerCase()) : true;
                    const segmentMatch = query.segment ? loc.segment.toLowerCase().includes(query.segment.toLowerCase()) : true;
                    const countryMatch = query.country ? loc.country.toLowerCase().includes(query.country.toLowerCase()) : true; // NEW: Match country
                    return siteMatch && zoneMatch && segmentMatch && countryMatch; // NEW: Include country in full match
                })) { versionMatch = true; }
                if ((query.obsKey || query.obsValue) && version.observability_links && version.observability_links.some(link => {
                    const keyMatch = query.obsKey ? link.key.toLowerCase().includes(query.obsKey.toLowerCase()) : true;
                    const valueMatch = query.obsValue ? link.value.toLowerCase().includes(query.obsValue.toLowerCase()) : true;
                    return keyMatch && valueMatch;
                })) { versionMatch = true; }

                if (versionMatch) {
                    componentFilteredVersions.push(version);
                    componentMatchDirect = true;
                }
            });

            if (componentFilteredVersions.length > 0 || (componentMatchDirect && Object.keys(query).every(k => !['version', 'lifecycleStatus', 'governanceStatus', 'searchText', 'standardsTag', 'capability', 'site', 'zone', 'segment', 'country', 'obsKey', 'obsValue'].includes(k)))) { // NEW: Add country to key check
                const clonedComponent = { ...entity, component_versions: componentFilteredVersions };
                // Only add if it's not already covered by a matching category
                if (!results.some(r => r.type === "Category" && r.components && r.components.some(c => c.id === clonedComponent.id))) {
                    results.push(clonedComponent);
                }
            }
        }
        // --- End Filter Components ---

        // --- Filter CustomerOptionSets (top-level, if not already included via Category filter or no category query) ---
        if (entity.type === "CustomerOptionSet" && !query.categoryName && !query.categoryStatus) {
            let optionSetMatchDirect = false;

            if (query.customerName && entity.customer_name.toLowerCase().includes(query.customerName.toLowerCase())) { optionSetMatchDirect = true; }
            if (query.customerOptionVersion && entity.customer_option_version.toLowerCase().includes(query.customerOptionVersion.toLowerCase())) { optionSetMatchDirect = true; }
            if (query.customerLifecycleStatus && entity.lifecycle_status.toLowerCase() === query.customerLifecycleStatus.toLowerCase()) { optionSetMatchDirect = true; }
            if (query.customerGovernanceStatus && entity.governance && entity.governance.status.toLowerCase() === query.customerGovernanceStatus.toLowerCase()) { optionSetMatchDirect = true; }
            if (query.customerCapabilityRequired) {
                const searchCap = query.customerCapabilityRequired.toLowerCase();
                if (entity.capabilities_required && entity.capabilities_required.some(cap => cap.toLowerCase().includes(searchCap))) { optionSetMatchDirect = true; }
            }
            if (query.optionName) {
                const searchOptName = query.optionName.toLowerCase();
                if (entity.options && entity.options.some(opt => opt.option_name.toLowerCase().includes(searchOptName))) { optionSetMatchDirect = true; }
            }
            if (query.pseudocodeKeyword) {
                const searchPseudo = query.pseudocodeKeyword.toLowerCase();
                if (entity.options && entity.options.some(opt => opt.config_block_pseudocode && opt.config_block_pseudocode.toLowerCase().includes(searchPseudo))) { optionSetMatchDirect = true; }
            }
            const optionSetSearchableText = `${entity.customer_name || ''} ${entity.guidance_rationale || ''} ` +
                                            (entity.capabilities_required ? entity.capabilities_required.join(' ') : '') + ' ' +
                                            (entity.options ? entity.options.map(o => o.option_name + ' ' + o.config_block_pseudocode).join(' ') : '');
            if (query.keyword && optionSetSearchableText.toLowerCase().includes(query.keyword.toLowerCase())) { optionSetMatchDirect = true; }
            if (query.searchText && optionSetSearchableText.toLowerCase().includes(query.searchText.toLowerCase())) { optionSetMatchDirect = true; }

            if (optionSetMatchDirect) {
                // Only add if it's not already covered by a matching category
                if (!results.some(r => r.type === "Category" && r.customer_options && r.customer_options.some(cos => cos.id === entity.id))) {
                    results.push(entity);
                }
            }
        }
        // --- End Filter CustomerOptionSets ---
    });

    return results;
};


// --- Main Routes ---

// Home page: Displays list of Categories, Components, and Customer Option Sets
app.get(`/${appName}/`, (req, res) => {
    const allData = readData();
    // Filter allData into specific types for rendering in index.ejs
    const categories = allData.filter(item => item.type === "Category");
    const components = allData.filter(item => item.type === "Component");
    const customerOptionSets = allData.filter(item => item.type === "CustomerOptionSet");

    res.render('index', {
        categories: categories,
        components: components,
        customerOptionSets: customerOptionSets,
        message: req.query.message || null,
        appName: appName
    });
});

// Route to view a specific Category and its associated Components/Customer Option Sets
// Passes ALL components and ALL customer option sets to EJS for client-side filtering by category_id
app.get(`/${appName}/category/:categoryId`, (req, res) => {
    const allData = readData();
    const category = allData.find(item => item.id === req.params.categoryId && item.type === "Category");
    const allComponents = allData.filter(item => item.type === "Component");
    const allCustomerOptionSets = allData.filter(item => item.type === "CustomerOptionSet");

    if (!category) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Category not found.'));
    }
    // Render the category_detail.ejs template
    res.render('category_detail', {
        category: category,
        allComponents: allComponents, // Passed to EJS for filtering by category_id
        allCustomerOptionSets: allCustomerOptionSets, // Passed to EJS for filtering by category_id
        message: req.query.message || null,
        appName: appName
    });
});

// Route to view a specific Component (placeholder for future dedicated page)
app.get(`/${appName}/component/:componentId`, (req, res) => {
    const allData = readData();
    const component = allData.find(item => item.id === req.params.componentId && item.type === "Component");
    if (!component) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Component not found.'));
    }
    // For now, redirect to home with a message or return JSON
    res.redirect(`/${appName}/?message=` + encodeURIComponent(`Component "${component.name}" details will be here. (ID: ${component.id})`));
    // In a full app, you'd render a dedicated component_detail.ejs here.
});


// Route to view a specific Customer Option Set
app.get(`/${appName}/customer-options/:optionSetId`, (req, res) => {
    const allData = readData();
    const optionSet = allData.find(item => item.id === req.params.optionSetId && item.type === "CustomerOptionSet");

    if (!optionSet) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Customer Option Set not found.'));
    }
    res.render('customer_option_detail', { optionSet: optionSet, message: req.query.message || null, appName: appName });
});


// --- POST Routes for Adding Data ---

// Add a new Category
app.post(`/${appName}/add-category`, (req, res) => {
    const allData = readData();
    const newCategory = {
        id: 'category_' + Date.now().toString().slice(-6),
        type: "Category", // Explicitly set type
        category_version: req.body.category_version || '1.0.0',
        name: req.body.name || 'New Category',
        status: req.body.status || 'notApproved',
        governance_record_link: req.body.governance_record_link || '',
        topology_view_link: req.body.topology_view_link || '',
        rationale: req.body.rationale || '',
        guidelines_library_tags: parseStringToArray(req.body.guidelines_library_tags),
        controls_alignments_library_tags: parseStringToArray(req.body.controls_alignments_library_tags),
        standards_library_tags: parseStringToArray(req.body.standards_library_tags),
        roadmap_link: req.body.roadmap_link || '',
        fsa_link: req.body.fsa_link || '',
        fsa_library_tags: parseStringToArray(req.body.fsa_library_tags),
        observability_kvp: parseKVP(req.body, 'observability_'),
        contacts_kvp: parseKVP(req.body, 'contacts_'),
        last_updated: new Date().toISOString() // Add timestamp
    };
    allData.push(newCategory);
    writeData(allData);
    res.redirect(`/${appName}/?message=` + encodeURIComponent('Category added successfully!'));
});

// Add a new Component
app.post(`/${appName}/add-component`, (req, res) => {
    const allData = readData();
    // Validate that the category_id exists before adding component
    const associatedCategory = allData.find(item => item.id === req.body.category_id && item.type === "Category");
    if (!associatedCategory) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Associated Category not found for component.'));
    }

    const newComponentVersion = {
        version: req.body.version || '1.0.0',
        lifecycle_status: req.body.lifecycle_status || 'active', // Should align with new values
        governance: {
            status: req.body.governance_status || 'draft',
            approval_link: req.body.governance_approval_link || ''
        },
        topology_diagram_link: req.body.topology_diagram_link || '',
        deployment_locations: parseDeploymentLocations(req.body, 'deployment_'),
        operational_guidelines_link: req.body.operational_guidelines_link || '',
        standards_tags: parseStringToArray(req.body.standards_tags),
        observability_links: parseKVP(req.body, 'obs_'), // Using parseKVP for consistency
        base_config_source_link: req.body.base_config_source_link || '',
        supported_capabilities: parseStringToArray(req.body.supported_capabilities)
    };

    const newComponent = {
        id: 'comp_' + Date.now().toString().slice(-6),
        type: "Component", // Explicitly set type
        category_id: req.body.category_id, // Link to category
        name: req.body.name || 'New Component',
        description: req.body.description || '',
        component_type: req.body.component_type || 'service',
        component_label: req.body.component_label || 'strategic',
        arr_flags: parseFlagLinks(req.body, 'arr_'), // Parse ARR flags
        risk_flags: parseFlagLinks(req.body, 'risk_'), // Parse Risk flags
        last_updated: new Date().toISOString(), // Add timestamp
        component_versions: [newComponentVersion] // Initialize with the first version
    };

    allData.push(newComponent); // Add component as top-level
    writeData(allData);
    res.redirect(`/${appName}/category/${req.body.category_id}/?message=` + encodeURIComponent('Component added successfully with its first version!'));
});

// Add a new Version to an existing Component
app.post(`/${appName}/component/:componentId/add-version`, (req, res) => {
    const allData = readData();
    const component = allData.find(item => item.id === req.params.componentId && item.type === "Component");

    if (!component) {
        const redirectPath = req.body.categoryId ? `/${appName}/category/${req.body.categoryId}` : `/${appName}/`;
        return res.redirect(redirectPath + `?message=` + encodeURIComponent('Error: Component not found for adding version.'));
    }

    const newComponentVersion = {
        version: req.body.version || '1.0.0',
        lifecycle_status: req.body.lifecycle_status || 'active', // Should align with new values
        governance: {
            status: req.body.governance_status || 'draft',
            approval_link: req.body.governance_approval_link || ''
        },
        topology_diagram_link: req.body.topology_diagram_link || '',
        deployment_locations: parseDeploymentLocations(req.body, 'new_version_deployment_'),
        operational_guidelines_link: req.body.operational_guidelines_link || '',
        standards_tags: parseStringToArray(req.body.standards_tags),
        observability_links: parseKVP(req.body, 'new_version_obs_'),
        base_config_source_link: req.body.base_config_source_link || '',
        supported_capabilities: parseStringToArray(req.body.supported_capabilities)
    };

    // Prevent duplicate versions by string
    const existingVersion = component.component_versions.find(v => v.version === newComponentVersion.version);
    if (existingVersion) {
        const redirectPath = req.body.categoryId ? `/${appName}/category/${req.body.categoryId}` : `/${appName}/`;
        return res.redirect(redirectPath + `?message=` + encodeURIComponent(`Error: Version "${newComponentVersion.version}" already exists for this component.`));
    }

    component.component_versions.push(newComponentVersion);
    component.last_updated = new Date().toISOString(); // Update component timestamp when version added
    writeData(allData);
    const redirectPath = req.body.categoryId ? `/${appName}/category/${req.body.categoryId}` : `/${appName}/`;
    res.redirect(redirectPath + `?message=` + encodeURIComponent('New version added to component!'));
});

// Add a new Customer Option Set
app.post(`/${appName}/add-customer-option-set`, (req, res) => {
    const allData = readData();
    // Validate that the category_id exists before adding customer option set
    const associatedCategory = allData.find(item => item.id === req.body.category_id && item.type === "Category");
    if (!associatedCategory) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Associated Category not found for customer option set.'));
    }

    const newCustomerOptionSet = {
        id: 'customer_opt_' + Date.now().toString().slice(-6),
        type: "CustomerOptionSet", // Explicitly set type
        category_id: req.body.category_id, // Link to category
        customer_name: req.body.customer_name || 'New Customer',
        customer_option_version: req.body.customer_option_version || '1.0.0',
        lifecycle_status: req.body.lifecycle_status || 'active', // Should align with new values
        governance: {
            status: req.body.governance_status || 'draft',
            approval_link: req.body.governance_approval_link || ''
        },
        guidance_rationale: req.body.guidance_rationale || '',
        capabilities_required: parseStringToArray(req.body.capabilities_required),
        options: parseCustomerOptions(req.body),
        last_updated: new Date().toISOString() // Add timestamp
    };
    allData.push(newCustomerOptionSet); // Add as top-level
    writeData(allData);
    res.redirect(`/${appName}/category/${req.body.category_id}/?message=` + encodeURIComponent('Customer Option Set added successfully!'));
});


// --- POST Routes for Updating Data ---

// Update Category
app.post(`/${appName}/update-category`, (req, res) => {
    const allData = readData();
    const { id, category_version, name, status, governance_record_link, topology_view_link, rationale, roadmap_link, fsa_link } = req.body;
    const categoryIndex = allData.findIndex(item => item.id === id && item.type === "Category");

    if (categoryIndex > -1) {
        allData[categoryIndex].category_version = category_version;
        allData[categoryIndex].name = name;
        allData[categoryIndex].status = status; // Should align with new values
        allData[categoryIndex].governance_record_link = governance_record_link;
        allData[categoryIndex].topology_view_link = topology_view_link;
        allData[categoryIndex].rationale = rationale;
        allData[categoryIndex].guidelines_library_tags = parseStringToArray(req.body.guidelines_library_tags);
        allData[categoryIndex].controls_alignments_library_tags = parseStringToArray(req.body.controls_alignments_library_tags);
        allData[categoryIndex].standards_library_tags = parseStringToArray(req.body.standards_library_tags);
        allData[categoryIndex].roadmap_link = roadmap_link;
        allData[categoryIndex].fsa_link = fsa_link;
        allData[categoryIndex].fsa_library_tags = parseStringToArray(req.body.fsa_library_tags);
        allData[categoryIndex].observability_kvp = parseKVP(req.body, 'observability_');
        allData[categoryIndex].contacts_kvp = parseKVP(req.body, 'contacts_');
        allData[categoryIndex].last_updated = new Date().toISOString(); // Update timestamp

        writeData(allData);
        res.redirect(`/${appName}/category/${id}/?message=` + encodeURIComponent('Category updated successfully!'));
    } else {
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Category not found for update.'));
    }
});


// Update Customer Option Set
app.post(`/${appName}/update-customer-option-set`, (req, res) => {
    const allData = readData();
    const { id, category_id, customer_name, customer_option_version, lifecycle_status, governance_status, governance_approval_link, guidance_rationale, capabilities_required } = req.body;
    const optionSetIndex = allData.findIndex(item => item.id === id && item.type === "CustomerOptionSet");

    if (optionSetIndex > -1) {
        allData[optionSetIndex].category_id = category_id; // Ensure category_id is preserved/updated
        allData[optionSetIndex].customer_name = customer_name;
        allData[optionSetIndex].customer_option_version = customer_option_version;
        allData[optionSetIndex].lifecycle_status = lifecycle_status; // Should align with new values
        allData[optionSetIndex].governance = {
            status: governance_status || 'draft',
            approval_link: governance_approval_link || ''
        };
        allData[optionSetIndex].guidance_rationale = guidance_rationale;
        allData[optionSetIndex].capabilities_required = parseStringToArray(capabilities_required);
        allData[optionSetIndex].options = parseCustomerOptions(req.body); // Re-parse all options
        allData[optionSetIndex].last_updated = new Date().toISOString(); // Update timestamp

        writeData(allData);
        // Redirect back to the category page if possible, else home
        const redirectPath = category_id ? `/${appName}/category/${category_id}` : `/${appName}/`;
        res.redirect(redirectPath + `?message=` + encodeURIComponent('Customer Option Set updated successfully!'));
    } else {
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Customer Option Set not found for update.'));
    }
});


// --- POST Routes for Deleting Data ---

// Delete Category (cascades delete to associated Components and Customer Option Sets)
app.post(`/${appName}/delete-category`, (req, res) => {
    let allData = readData();
    const { id } = req.body; // This is the category ID

    const initialDataLength = allData.length;

    // Filter out the category itself
    allData = allData.filter(item => item.id !== id || item.type !== "Category");

    // Filter out associated Components
    allData = allData.filter(item => !(item.type === "Component" && item.category_id === id));

    // Filter out associated Customer Option Sets
    allData = allData.filter(item => !(item.type === "CustomerOptionSet" && item.category_id === id));

    if (allData.length < initialDataLength) { // Check if anything was deleted
        writeData(allData);
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Category and its associated Components/Customer Option Sets deleted successfully!'));
    } else {
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Category not found for deletion.'));
    }
});


// Delete a Component (top-level)
app.post(`/${appName}/delete-component`, (req, res) => {
    let allData = readData();
    const { id, categoryId } = req.body; // Get categoryId for redirect
    const initialDataLength = allData.length;

    allData = allData.filter(item => !(item.id === id && item.type === "Component"));

    if (allData.length < initialDataLength) {
        writeData(allData);
        const redirectPath = categoryId ? `/${appName}/category/${categoryId}` : `/${appName}/`;
        res.redirect(redirectPath + `?message=` + encodeURIComponent('Component deleted successfully!'));
    } else {
        const redirectPath = categoryId ? `/${appName}/category/${categoryId}` : `/${appName}/`;
        res.redirect(redirectPath + `?message=` + encodeURIComponent('Error: Component not found for deletion.'));
    }
});


// Delete a specific Component Version
app.post(`/${appName}/component/:componentId/version/:versionString/delete`, (req, res) => {
    const allData = readData();
    const { categoryId } = req.body; // Get categoryId for redirect
    const component = allData.find(item => item.id === req.params.componentId && item.type === "Component");

    if (!component) {
        const redirectPath = categoryId ? `/${appName}/category/${categoryId}` : `/${appName}/`;
        return res.redirect(redirectPath + `?message=` + encodeURIComponent('Error: Component not found for version deletion.'));
    }

    const initialVersionCount = component.component_versions.length;
    component.component_versions = component.component_versions.filter(v => v.version !== req.params.versionString);

    if (component.component_versions.length < initialVersionCount) {
        component.last_updated = new Date().toISOString(); // Update component timestamp
        writeData(allData);
        const redirectPath = categoryId ? `/${appName}/category/${categoryId}` : `/${appName}/`;
        res.redirect(redirectPath + `?message=` + encodeURIComponent('Component version deleted successfully!'));
    } else {
        const redirectPath = categoryId ? `/${appName}/category/${categoryId}` : `/${appName}/`;
        res.redirect(redirectPath + `?message=` + encodeURIComponent('Error: Component version not found for deletion.'));
    }
});

// Delete Customer Option Set (top-level)
app.post(`/${appName}/delete-customer-option-set`, (req, res) => {
    let allData = readData();
    const { id, categoryId } = req.body; // Get categoryId for redirect
    const initialDataLength = allData.length;

    allData = allData.filter(item => !(item.id === id && item.type === "CustomerOptionSet"));

    if (allData.length < initialDataLength) {
        writeData(allData);
        const redirectPath = categoryId ? `/${appName}/category/${categoryId}` : `/${appName}/`;
        res.redirect(redirectPath + `?message=` + encodeURIComponent('Customer Option Set deleted successfully!'));
    } else {
        const redirectPath = categoryId ? `/${appName}/category/${categoryId}` : `/${appName}/`;
        res.redirect(redirectPath + `?message=` + encodeURIComponent('Error: Customer Option Set not found for deletion.'));
    }
});


// --- File Upload/Download Routes ---

// Download the entire mydata.json file
app.get(`/${appName}/download`, (req, res) => {
    res.download(DATA_FILE, 'mydata.json', (err) => {
        if (err) {
            console.error("Error downloading file:", err);
            if (!res.headersSent) {
                res.status(500).send("Could not download the file.");
            }
        }
    });
});

// Upload a new mydata.json file (replaces current data)
app.post(`/${appName}/upload`, upload.single('jsonFile'), (req, res) => {
    if (!req.file) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: No file uploaded.'));
    }
    const uploadedFilePath = req.file.path;

    fs.readFile(uploadedFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading uploaded file:", err);
            fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
            return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error reading uploaded file.'));
        }
        try {
            const uploadedJson = JSON.parse(data);
            if (!Array.isArray(uploadedJson)) {
                 fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
                 return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Uploaded file is not a valid JSON array.'));
            }
            writeData(uploadedJson); // Overwrite current data
            fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
            res.redirect(`/${appName}/?message=` + encodeURIComponent('JSON data uploaded successfully!'));
        } catch (parseError) {
            console.error("Error parsing uploaded JSON:", parseError);
            fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
            res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Invalid JSON file uploaded.'));
        }
    });
});


// --- Search API Endpoint ---
// Allows querying the data via URL parameters and returns JSON results
app.get(`/${appName}/search`, (req, res) => {
    const query = req.query; // Query parameters from the URL (e.g., ?keyword=proxy&site=London)
    const filteredResults = filterData(query); // Call the filtering logic
    res.json(filteredResults); // Return results as JSON
});


// --- Server Start ---
// Starts the Express server, listening on the configured port
app.listen(port, () => { // Removed 'localhost' to allow binding to all interfaces for deployment
    console.log(`Service started locally at http://localhost:${port}/${appName}/`);
    console.log(`For public access (if deployed), check your server/PaaS assigned URL with prefix /${appName}/`);
});
