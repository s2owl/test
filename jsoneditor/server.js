const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// --- Configuration ---
// Port: Uses process.env.PORT (for Heroku/PaaS), then APP_PORT, then falls back to 8082
const port = parseInt(process.env.PORT || process.env['APP_PORT'] || '8082');
// App Name: Used as a URL prefix, e.g., /myapp/
const appName = process.env['APP_NAME'] || 'myapp';

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

// Parses dynamic form fields for deployment locations (e.g., deployment_site_0, deployment_zone_0)
const parseDeploymentLocations = (body, prefix = 'deployment_') => {
    const locations = [];
    let i = 0;
    while (body[`${prefix}site_${i}`] || body[`${prefix}zone_${i}`] || body[`${prefix}segment_${i}`]) {
        locations.push({
            site: body[`${prefix}site_${i}`] || '',
            zone: body[`${prefix}zone_${i}`] || '',
            segment: body[`${prefix}segment_${i}`] || ''
        });
        i++;
    }
    return locations;
};

// Parses dynamic form fields for observability links (e.g., obs_key_0, obs_value_0)
const parseObservabilityLinks = (body, prefix = 'obs_') => {
    const links = [];
    let i = 0;
    while (body[`${prefix}key_${i}`] || body[`${prefix}value_${i}`]) {
        links.push({
            key: body[`${prefix}key_${i}`] || '',
            value: body[`${prefix}value_${i}`] || ''
        });
        i++;
    }
    return links;
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
const filterData = (query) => {
    let allData = readData(); // Load all data from the JSON file
    let results = []; // Array to store filtered results

    // Separate Parents and CustomerOptionSets for individual filtering
    const parents = allData.filter(item => item.components !== undefined);
    const customerOptionSets = allData.filter(item => item.type === "CustomerOptionSet");

    // --- Filter Parents and their nested Components/Versions ---
    parents.forEach(parent => {
        let parentMatch = false; // Flag if the parent itself matches (even if no components/versions do)
        const parentResults = { ...parent, components: [] }; // Clone parent to hold filtered components

        // Apply parent-level filters (e.g., parentName, parentLabel)
        if (query.parentName && parent.name.toLowerCase().includes(query.parentName.toLowerCase())) {
            parentMatch = true;
        }
        if (query.parentLabel && parent.parent_label.toLowerCase() === query.parentLabel.toLowerCase()) {
            parentMatch = true;
        }

        parent.components.forEach(component => {
            let componentMatch = false; // Flag if the component itself matches
            const componentResults = { ...component, component_versions: [] }; // Clone component to hold filtered versions

            // Apply component-level filters (e.g., componentName, componentType, componentLabel)
            if (query.componentName && component.name.toLowerCase().includes(query.componentName.toLowerCase())) {
                componentMatch = true;
            }
            if (query.componentType && component.component_type.toLowerCase() === query.componentType.toLowerCase()) {
                componentMatch = true;
            }
            if (query.componentLabel && component.component_label.toLowerCase() === query.componentLabel.toLowerCase()) {
                componentMatch = true;
            }

            component.component_versions.forEach(version => {
                let versionMatch = false; // Flag if the version itself matches

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

                // General text search across relevant fields (names, descriptions, links, statuses)
                const searchableText = `${parent.name || ''} ${parent.description || ''} ${parent.parent_label || ''} ` +
                                       `${component.name || ''} ${component.description || ''} ${component.component_type || ''} ${component.component_label || ''} ` +
                                       `${version.version || ''} ${version.lifecycle_status || ''} ${version.governance?.status || ''} ` +
                                       `${version.topology_diagram_link || ''} ${version.operational_guidelines_link || ''} ${version.base_config_source_link || ''}`;

                if (query.searchText && searchableText.toLowerCase().includes(query.searchText.toLowerCase())) {
                    versionMatch = true;
                }

                // Filter by standards_tags (checks if any tag includes the search term)
                if (query.standardsTag) {
                    const searchTag = query.standardsTag.toLowerCase();
                    if (version.standards_tags && version.standards_tags.some(tag => tag.toLowerCase().includes(searchTag))) {
                        versionMatch = true;
                    }
                }

                // Filter by supported_capabilities (checks if any capability includes the search term)
                if (query.capability) {
                    const searchCapability = query.capability.toLowerCase();
                    if (version.supported_capabilities && version.supported_capabilities.some(cap => cap.toLowerCase().includes(searchCapability))) {
                        versionMatch = true;
                    }
                }

                // Filter by deployment_locations (checks if any location matches site/zone/segment)
                if (query.site || query.zone || query.segment) {
                    if (version.deployment_locations && version.deployment_locations.some(loc => {
                        const siteMatch = query.site ? loc.site.toLowerCase().includes(query.site.toLowerCase()) : true;
                        const zoneMatch = query.zone ? loc.zone.toLowerCase().includes(query.zone.toLowerCase()) : true;
                        const segmentMatch = query.segment ? loc.segment.toLowerCase().includes(query.segment.toLowerCase()) : true;
                        return siteMatch && zoneMatch && segmentMatch;
                    })) {
                        versionMatch = true;
                    }
                }

                // Filter by observability_links (checks if any link key or value includes the search term)
                if (query.obsKey || query.obsValue) {
                    if (version.observability_links && version.observability_links.some(link => {
                        const keyMatch = query.obsKey ? link.key.toLowerCase().includes(query.obsKey.toLowerCase()) : true;
                        const valueMatch = query.obsValue ? link.value.toLowerCase().includes(query.obsValue.toLowerCase()) : true;
                        return keyMatch && valueMatch;
                    })) {
                        versionMatch = true;
                    }
                }

                // Specific keyword search (for "proxy", "SSL interception", etc.)
                // This searches component/version descriptions and supported capabilities
                if (query.keyword) {
                    const lowerKeyword = query.keyword.toLowerCase();
                    if (component.description && component.description.toLowerCase().includes(lowerKeyword) ||
                        version.operational_guidelines_link && version.operational_guidelines_link.toLowerCase().includes(lowerKeyword) ||
                        version.base_config_source_link && version.base_config_source_link.toLowerCase().includes(lowerKeyword)) {
                        versionMatch = true;
                    }
                    if (version.supported_capabilities && version.supported_capabilities.some(cap => cap.toLowerCase().includes(lowerKeyword))) {
                        versionMatch = true;
                    }
                }


                // If this version matches, add it to the results for this component
                if (versionMatch) {
                    componentResults.component_versions.push(version);
                    componentMatch = true; // If any version matches, the component itself effectively matches
                    parentMatch = true;    // If any component matches, the parent itself effectively matches
                }
            });

            // If component (or any of its versions) matches, add it to the parent results
            // The condition ensures that if no specific version-level queries were made,
            // or if a version query was made and matched, the component is included.
            if (componentResults.component_versions.length > 0 || (componentMatch && Object.keys(query).every(k => !['version', 'lifecycleStatus', 'governanceStatus', 'searchText', 'standardsTag', 'capability', 'site', 'zone', 'segment', 'obsKey', 'obsValue', 'keyword'].includes(k)))) {
                parentResults.components.push(componentResults);
            }
        });

        // Add parent to final results if it or any of its components/versions matched
        // Similar logic: include if components matched, or if parent matched without component-specific queries
        if (parentResults.components.length > 0 || (parentMatch && Object.keys(query).every(k => !['componentName', 'componentType', 'componentLabel', 'version', 'lifecycleStatus', 'governanceStatus', 'searchText', 'standardsTag', 'capability', 'site', 'zone', 'segment', 'obsKey', 'obsValue', 'keyword'].includes(k)))) {
             results.push(parentResults);
        }
    });

    // --- Filter CustomerOptionSets ---
    customerOptionSets.forEach(optionSet => {
        let optionSetMatch = false;

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
        // Search pseudo-code block for keywords
        if (query.pseudocodeKeyword) {
            const searchPseudo = query.pseudocodeKeyword.toLowerCase();
            if (optionSet.options && optionSet.options.some(opt => opt.config_block_pseudocode && opt.config_block_pseudocode.toLowerCase().includes(searchPseudo))) {
                optionSetMatch = true;
            }
        }

        if (optionSetMatch) {
            results.push(optionSet);
        }
    });

    return results;
};


// --- Main Routes ---

// Home page: Displays list of Parents and Customer Option Sets
app.get(`/${appName}/`, (req, res) => {
    const allData = readData();
    const parents = allData.filter(item => item.components !== undefined);
    const customerOptionSets = allData.filter(item => item.type === "CustomerOptionSet");

    res.render('index', {
        parents: parents,
        customerOptionSets: customerOptionSets,
        message: req.query.message || null,
        appName: appName
    });
});

// Route to view a specific Parent and its Components/Versions
app.get(`/${appName}/parent/:parentId`, (req, res) => {
    const allData = readData();
    const parent = allData.find(p => p.id === req.params.parentId && p.components !== undefined);

    if (!parent) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Parent not found.'));
    }
    res.render('parent_detail', { parent: parent, message: req.query.message || null, appName: appName });
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

// Add a new Parent API
app.post(`/${appName}/add-parent`, (req, res) => {
    const allData = readData();
    const newParent = {
        id: 'parent_' + Date.now().toString().slice(-6),
        name: req.body.parent_name || 'New Parent API',
        description: req.body.parent_description || '',
        parent_label: req.body.parent_label || 'strategic',
        components: []
    };
    allData.push(newParent);
    writeData(allData);
    res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent API added successfully!'));
});

// Add a new Component to a Parent (including its first version's details)
app.post(`/${appName}/parent/:parentId/add-component`, (req, res) => {
    const allData = readData();
    const parentIndex = allData.findIndex(p => p.id === req.params.parentId && p.components !== undefined);

    if (parentIndex === -1) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Parent not found for component add.'));
    }

    const newComponentVersion = {
        version: req.body.version || '1.0.0',
        lifecycle_status: req.body.lifecycle_status || 'active',
        governance: {
            status: req.body.governance_status || 'draft',
            approval_link: req.body.governance_approval_link || ''
        },
        topology_diagram_link: req.body.topology_diagram_link || '',
        deployment_locations: parseDeploymentLocations(req.body, 'deployment_'),
        operational_guidelines_link: req.body.operational_guidelines_link || '',
        standards_tags: parseStringToArray(req.body.standards_tags),
        observability_links: parseObservabilityLinks(req.body, 'obs_'),
        base_config_source_link: req.body.base_config_source_link || '',
        supported_capabilities: parseStringToArray(req.body.supported_capabilities)
    };

    const newComponent = {
        id: 'comp_' + Date.now().toString().slice(-6),
        name: req.body.comp_name || 'New Component',
        description: req.body.comp_description || '',
        component_type: req.body.component_type || 'service',
        component_label: req.body.component_label || 'strategic',
        component_versions: [newComponentVersion] // Initialize with the first version
    };

    allData[parentIndex].components.push(newComponent);
    writeData(allData);
    res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Component added successfully with its first version!'));
});

// Add a new Version to an existing Component
app.post(`/${appName}/parent/:parentId/component/:componentId/add-version`, (req, res) => {
    const allData = readData();
    const parent = allData.find(p => p.id === req.params.parentId && p.components !== undefined);

    if (!parent) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Parent not found for adding version.'));
    }

    const component = parent.components.find(c => c.id === req.params.componentId);

    if (!component) {
        return res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Error: Component not found for adding version.'));
    }

    const newComponentVersion = {
        version: req.body.version || '1.0.0',
        lifecycle_status: req.body.lifecycle_status || 'active',
        governance: {
            status: req.body.governance_status || 'draft',
            approval_link: req.body.governance_approv