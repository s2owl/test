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

if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

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

// --- Routes ---

// Home page: List Parents
app.get(`/${appName}/`, (req, res) => {
    const parents = readData();
    res.render('index', { parents: parents, message: req.query.message || null, appName: appName });
});

// View a specific Parent and its Components
app.get(`/${appName}/parent/:parentId`, (req, res) => {
    const parents = readData();
    const parent = parents.find(p => p.id === req.params.parentId);

    if (!parent) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent not found.'));
    }
    res.render('parent_detail', { parent: parent, message: req.query.message || null, appName: appName });
});

// Add a new Parent API
app.post(`/${appName}/add-parent`, (req, res) => {
    const parents = readData();
    const newParent = {
        id: 'parent_' + Date.now().toString().slice(-6),
        name: req.body.parent_name || 'New Parent API',
        description: req.body.parent_description || '',
        parent_version: req.body.parent_version || '1.0.0',
        label: req.body.parent_label || 'strategic',
        components: [] // Start with no components
    };
    parents.push(newParent);
    writeData(parents);
    res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent API added successfully!'));
});

// Add a new Component to a Parent (Simplified: expects fixed component fields)
app.post(`/${appName}/parent/:parentId/add-component`, (req, res) => {
    const parents = readData();
    const parentIndex = parents.findIndex(p => p.id === req.params.parentId);

    if (parentIndex === -1) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent not found for component add.'));
    }

    // Process nested data from form. This is the crucial part for 'Option B' on server side.
    // The UI will send individual fields, not JSON strings.
    const newComponent = {
        id: 'comp_' + Date.now().toString().slice(-6),
        name: req.body.comp_name || 'New Component',
        description: req.body.comp_description || '',
        component_version: req.body.comp_version || '1.0.0',
        label: req.body.comp_label || 'strategic',
        details: {
            topology: {
                diagramLink: req.body.topology_diagramLink || '',
                // connectedSystems will need special handling for multiple inputs
                connectedSystems: req.body.topology_connectedSystems ? req.body.topology_connectedSystems.split(',').map(s => s.trim()) : []
            },
            // Guidelines will need special handling for multiple title/link pairs
            guidelines: [],
            // Standards will need special handling for multiple inputs
            standards: req.body.standards ? req.body.standards.split(',').map(s => s.trim()) : [],
            // configOptions will need special handling for multiple key/value/type/options/default
            configOptions: []
        }
    };

    // --- Handling dynamic arrays from form (Example for Guidelines, you'd extend this) ---
    // If you have dynamic "add guideline" fields on the UI, they might be named guideline_title_0, guideline_link_0, guideline_title_1, etc.
    // Or you could send them as a JSON string from the client side if JS is creating the structure.
    // For simplicity, let's assume a single guideline for now, or you'd need more complex parsing here.
    if (req.body['guideline_title_0'] && req.body['guideline_link_0']) {
        newComponent.details.guidelines.push({
            title: req.body['guideline_title_0'],
            link: req.body['guideline_link_0']
        });
    }
    // Similarly for configOptions, etc. This shows why a client-side framework helps!
    // Or, for simplicity, you could revert these complex arrays to being JSON strings input via textarea,
    // even with Option B for other fields.

    parents[parentIndex].components.push(newComponent);
    writeData(parents);
    res.redirect(`/${appName}/parent/${req.params.parentId}/?message=` + encodeURIComponent('Component added successfully!'));
});

// Update Parent (Simplified)
app.post(`/${appName}/update-parent`, (req, res) => {
    const parents = readData();
    const { id, parent_name, parent_description, parent_version, parent_label } = req.body;
    const parentIndex = parents.findIndex(p => p.id === id);

    if (parentIndex > -1) {
        parents[parentIndex].name = parent_name;
        parents[parentIndex].description = parent_description;
        parents[parentIndex].parent_version = parent_version;
        parents[parentIndex].label = parent_label;
        writeData(parents);
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent API updated successfully!'));
    } else {
        res.redirect(`/${appName}/?message=` + encodeURIComponent('Error: Parent not found for update.'));
    }
});


// Delete Parent
app.post(`/${appName}/delete-parent`, (req, res) => {
    const parents = readData();
    const { id } = req.body;
    const updatedParents = parents.filter(p => p.id !== id);
    writeData(updatedParents);
    res.redirect(`/${appName}/?message=` + encodeURIComponent('Parent API deleted successfully!'));
});

// --- Upload/Download remain the same ---
app.get('/download', (req, res) => { /* ... same as before ... */ });
app.post('/upload', upload.single('jsonFile'), (req, res) => { /* ... same as before ... */ });

// Start the server
app.listen(port, 'localhost', () => {
    console.log(`Service started at http://localhost:${port}/${appName}/`);
});
