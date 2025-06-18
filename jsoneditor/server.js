const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const port = parseInt(process.env['APP_PORT'] || '8082');
const appName = process.env['APP_NAME'] || 'myapp';

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(`/${appName}/`, express.static(path.join(__dirname, 'static')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const DATA_FILE = path.join(__dirname, 'data', 'mydata.json');

// Ensure directories exist
['data', 'uploads'].forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
});

// Ensure mydata.json exists and is a valid array
// Read, then check if it's an array. If not, write an empty array.
try {
    const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
    const parsedContent = JSON.parse(fileContent);
    if (!Array.isArray(parsedContent)) {
        fs.writeFileSync(DATA_FILE, '[]', 'utf8');
    }
} catch (error) {
    // If file doesn't exist or is invalid JSON, create it as an empty array
    if (error.code === 'ENOENT' || error instanceof SyntaxError) {
        fs.writeFileSync(DATA_FILE, '[]', 'utf8');
    } else {
        console.error("Error checking/initializing data file:", error);
    }
}


const upload = multer({ dest: 'uploads/' });

// --- Helper Functions ---
const readData = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading data file:", error.message);
        return [];
    }
};

const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Error writing data file:", error.message);
    }
};

// Helper to parse comma-separated strings to array of strings
const parseStringToArray = (str) => {
    return str ? str.split(',').map(s => s.trim()).filter(s => s !== '') : [];
};

// Helper to parse dynamic form fields for deployment_locations
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

// Helper to parse dynamic form fields for observability_links
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

// Helper to parse dynamic form fields for customer options
const parseCustomerOptions = (body, prefix = 'option_') => {
    const options = [];
    let i = 0;
    while (body[`${prefix}name_${i}`] || body[`config_pseudocode_${i}`]) { // Note: config_pseudocode doesn't have a prefix in the current form. Adjust as needed.
        options.push({
            option_name: body[`${prefix}name_${i}`] || '',
            config_block_pseudocode: body[`config_pseudocode_${i}`] || '' // Assuming this name
        });
        i++;
    }
    return options;
};


// --- Routes ---

// Home page: Lists Parents and Customer Option Sets
app.get(`/${appName}/`, (req, res) => {
    const allData = readData();
    const parents = allData.filter(item => item.components !== undefined); // Simple check for parent type
    const customerOptionSets = allData.filter(item => item.type === "CustomerOptionSet");

    res.render('index', {
        parents: parents,
        customerOptionSets: customerOptionSets,
        message: req.query.message || null,
        appName: appName
    });
});

// View a specific Parent and its Components/Versions
app.get(`/${appName}/parent/:parentId`, (req, res) => {
    const allData = readData();
    const parent = allData.find(p => p.id === req.params.parentId && p.components !== undefined);

    if (!parent) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent not found.'));
    }
    res.render('parent_detail', { parent: parent, message: req.query.message || null, appName: appName });
});

// View a specific Customer Option Set
app.get(`/${appName}/customer-options/:optionSetId`, (req, res) => {
    const allData = readData();
    const optionSet = allData.find(item => item.id === req.params.optionSetId && item.type === "CustomerOptionSet");

    if (!optionSet) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Customer Option Set not found.'));
    }
    res.render('customer_option_detail', { optionSet: optionSet, message: req.query.message || null, appName: appName });
});


// Add a new Parent API
app.post(`/${appName}/add-parent`, (req, res) => {
    const allData = readData();
    const newParent = {
        id: 'parent_' + Date.now().toString().slice(-6), // Simple ID
        name: req.body.parent_name || 'New Parent API',
        description: req.body.parent_description || '',
        parent_label: req.body.parent_label || 'strategic',
        components: []
    };
    allData.push(newParent);
    writeData(allData);
    res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent API added successfully!'));
});

// Update Parent
app.post(`/${appName}/update-parent`, (req, res) => {
    const allData = readData();
    const { id, parent_name, parent_description, parent_label } = req.body;
    const parentIndex = allData.findIndex(p => p.id === id && p.components !== undefined);

    if (parentIndex > -1) {
        allData[parentIndex].name = parent_name;
        allData[parentIndex].description = parent_description;
        allData[parentIndex].parent_label = parent_label;
        writeData(allData);
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent API updated successfully!'));
    } else {
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Parent not found for update.'));
    }
});

// Delete Parent
app.post(`/${appName}/delete-parent`, (req, res) => {
    const allData = readData();
    const { id } = req.body;
    const updatedData = allData.filter(item => item.id !== id);
    writeData(updatedData);
    res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent API deleted successfully!'));
});


// Add a new Component to a Parent (including its first version)
app.post(`/${appName}/parent/:parentId/add-component`, (req, res) => {
    const allData = readData();
    const parentIndex = allData.findIndex(p => p.id === req.params.parentId && p.components !== undefined);

    if (parentIndex === -1) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent not found for component add.'));
    }

    const newComponentVersion = {
        version: req.body.version || '1.0.0',
        lifecycle_status: req.body.lifecycle_status || 'active',
        governance: {
            status: req.body.governance_status || 'draft',
            approval_link: req.body.governance_approval_link || ''
        },
        topology_diagram_link: req.body.topology_diagram_link || '',
        deployment_locations: parseDeploymentLocations(req.body, 'deployment_'), // Use specific prefix
        operational_guidelines_link: req.body.operational_guidelines_link || '',
        standards_tags: parseStringToArray(req.body.standards_tags),
        observability_links: parseObservabilityLinks(req.body, 'obs_'), // Use specific prefix
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
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent not found for adding version.'));
    }

    const component = parent.components.find(c => c.id === req.params.componentId);

    if (!component) {
        return res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Component not found for adding version.'));
    }

    const newComponentVersion = {
        version: req.body.version || '1.0.0',
        lifecycle_status: req.body.lifecycle_status || 'active',
        governance: {
            status: req.body.governance_status || 'draft',
            approval_link: req.body.governance_approval_link || ''
        },
        topology_diagram_link: req.body.topology_diagram_link || '',
        // Use version-specific prefixes for dynamic fields for add-version forms
        deployment_locations: parseDeploymentLocations(req.body, 'new_version_deployment_'),
        operational_guidelines_link: req.body.operational_guidelines_link || '',
        standards_tags: parseStringToArray(req.body.standards_tags),
        observability_links: parseObservabilityLinks(req.body, 'new_version_obs_'),
        base_config_source_link: req.body.base_config_source_link || '',
        supported_capabilities: parseStringToArray(req.body.supported_capabilities)
    };

    // Check for duplicate version
    const existingVersion = component.component_versions.find(v => v.version === newComponentVersion.version);
    if (existingVersion) {
        return res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent(`Error: Version ${newComponentVersion.version} already exists for this component.`));
    }

    component.component_versions.push(newComponentVersion);
    writeData(allData);
    res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('New version added to component!'));
});


// Delete a Component
app.post(`/${appName}/parent/:parentId/component/:componentId/delete`, (req, res) => {
    const allData = readData();
    const parentIndex = allData.findIndex(p => p.id === req.params.parentId && p.components !== undefined);

    if (parentIndex === -1) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent not found for component deletion.'));
    }

    const initialComponentCount = allData[parentIndex].components.length;
    allData[parentIndex].components = allData[parentIndex].components.filter(c => c.id !== req.params.componentId);

    if (allData[parentIndex].components.length < initialComponentCount) {
        writeData(allData);
        res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Component deleted successfully!'));
    } else {
        res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Error: Component not found for deletion.'));
    }
});


// Delete a Component Version
app.post(`/${appName}/parent/:parentId/component/:componentId/version/:versionString/delete`, (req, res) => {
    const allData = readData();
    const parent = allData.find(p => p.id === req.params.parentId && p.components !== undefined);

    if (!parent) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent not found for version deletion.'));
    }

    const component = parent.components.find(c => c.id === req.params.componentId);

    if (!component) {
        return res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Component not found for version deletion.'));
    }

    const initialVersionCount = component.component_versions.length;
    component.component_versions = component.component_versions.filter(v => v.version !== req.params.versionString);

    if (component.component_versions.length < initialVersionCount) {
        writeData(allData);
        res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Component version deleted successfully!'));
    } else {
        res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Error: Component version not found for deletion.'));
    }
});


// Add a new Customer Option Set
app.post(`/${appName}/add-customer-option-set`, (req, res) => {
    const allData = readData();
    const newCustomerOptionSet = {
        id: 'customer_opt_' + Date.now().toString().slice(-6),
        type: "CustomerOptionSet",
        customer_name: req.body.customer_name || 'New Customer',
        customer_option_version: req.body.customer_option_version || '1.0.0',
        lifecycle_status: req.body.lifecycle_status || 'active',
        governance: {
            status: req.body.governance_status || 'draft',
            approval_link: req.body.governance_approval_link || ''
        },
        guidance_rationale: req.body.guidance_rationale || '',
        capabilities_required: parseStringToArray(req.body.capabilities_required),
        options: parseCustomerOptions(req.body) // Dynamic options
    };
    allData.push(newCustomerOptionSet);
    writeData(allData);
    res.redirect(`/${appName}/?message=` + encodeURIComponent('Customer Option Set added successfully!'));
});

// Update Customer Option Set (Simplified for now - assumes same dynamic fields as add)
app.post(`/${appName}/update-customer-option-set`, (req, res) => {
    const allData = readData();
    const { id, customer_name, customer_option_version, lifecycle_status, governance_status, governance_approval_link, guidance_rationale, capabilities_required } = req.body;
    const optionSetIndex = allData.findIndex(item => item.id === id && item.type === "CustomerOptionSet");

    if (optionSetIndex > -1) {
        allData[optionSetIndex].customer_name = customer_name;
        allData[optionSetIndex].customer_option_version = customer_option_version;
        allData[optionSetIndex].lifecycle_status = lifecycle_status;
        allData[optionSetIndex].governance = {
            status: governance_status || 'draft',
            approval_link: governance_approval_link || ''
        };
        allData[optionSetIndex].guidance_rationale = guidance_rationale;
        allData[optionSetIndex].capabilities_required = parseStringToArray(capabilities_required);
        allData[optionSetIndex].options = parseCustomerOptions(req.body); // Re-parse all options

        writeData(allData);
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Customer Option Set updated successfully!'));
    } else {
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Customer Option Set not found for update.'));
    }
});


// Delete Customer Option Set
app.post(`/${appName}/delete-customer-option-set`, (req, res) => {
    const allData = readData();
    const { id } = req.body;
    const updatedData = allData.filter(item => item.id !== id);
    writeData(updatedData);
    res.redirect(`/${appName}/?message=` + encodeURIComponent('Customer Option Set deleted successfully!'));
});


// --- Upload/Download Routes ---

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

app.post(`/${appName}/upload`, upload.single('jsonFile'), (req, res) => {
    if (!req.file) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('No file uploaded.'));
    }
    const uploadedFilePath = req.file.path;

    fs.readFile(uploadedFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading uploaded file:", err);
            fs.unlink(uploadedFilePath, () => {});
            return res.redirect(`/${appName}/?message=` + encodeURIComponent('Error reading uploaded file.'));
        }
        try {
            const uploadedJson = JSON.parse(data);
            if (!Array.isArray(uploadedJson)) {
                 fs.unlink(uploadedFilePath, () => {});
                 return res.redirect(`/${appName}/?message=` + encodeURIComponent('Uploaded file is not a valid JSON array.'));
            }
            writeData(uploadedJson);
            fs.unlink(uploadedFilePath, () => {});
            res.redirect(`/${appName}/?message=` + encodeURIComponent('JSON data uploaded successfully!'));
        } catch (parseError) {
            console.error("Error parsing uploaded JSON:", parseError);
            fs.unlink(uploadedFilePath, () => {});
            res.redirect(`/${appName}/?message=` + encodeURIComponent('Invalid JSON file uploaded.'));
        }
    });
});


// Start the server
app.listen(port, 'localhost', () => {
    console.log(`Service started at http://localhost:${port}/${appName}/`);
});
