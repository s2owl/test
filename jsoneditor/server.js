const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // Install this: npm install multer

// Your existing port and app name setup
const port = parseInt(process.env['APP_PORT'] || '8082');
const appName = process.env['APP_NAME'] || 'myapp';

const app = express();

// --- Configuration ---
// Set EJS as the view engine
app.set('view engine', 'ejs');
// Point to your 'views' directory for templates
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the 'static' directory (as seen in your screenshot)
// Make sure you have a directory named 'static' in your project root for CSS, JS, etc.
app.use(`/${appName}/`, express.static(path.join(__dirname, 'static')));

// Middleware for parsing request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- File System Setup ---
const DATA_FILE = path.join(__dirname, 'data', 'mydata.json');
// Make sure the 'data' directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}
// Ensure mydata.json exists (or create an empty array if not)
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' }); // Temporary directory for uploaded files
// Make sure the 'uploads' directory exists
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// --- Helper Functions ---
const readData = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading data file:", error.message);
        return []; // Return empty array if file not found or invalid JSON
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

// Home page - display current data
app.get(`/${appName}/`, (req, res) => {
    const data = readData();
    res.render('index', { data: data, message: req.query.message || null, appName: appName });
});

// Add new item
app.post(`/${appName}/add`, (req, res) => {
    const data = readData();
    const newItem = {
        id: 'item' + (data.length + 1 + Date.now().toString().slice(-4)),
        title: req.body.title || 'New Item',
        description: req.body.description || ''
    };
    data.push(newItem);
    writeData(data);
    res.redirect(`/${appName}/`);
});

// Update item
app.post(`/${appName}/update`, (req, res) => {
    const data = readData();
    const { id, title, description } = req.body;
    const itemIndex = data.findIndex(item => item.id === id);

    if (itemIndex > -1) {
        data[itemIndex].title = title;
        data[itemIndex].description = description;
        writeData(data);
    }
    res.redirect(`/${appName}/`);
});

// Delete item
app.post(`/${appName}/delete`, (req, res) => {
    const data = readData();
    const { id } = req.body;
    const newData = data.filter(item => item.id !== id);
    writeData(newData);
    res.redirect(`/${appName}/`);
});

// Reorder items (move up/down)
app.post(`/${appName}/move`, (req, res) => {
    const data = readData();
    const { id, direction } = req.body;
    const itemIndex = data.findIndex(item => item.id === id);

    if (itemIndex > -1) {
        if (direction === 'up' && itemIndex > 0) {
            [data[itemIndex], data[itemIndex - 1]] = [data[itemIndex - 1], data[itemIndex]]; // Swap
        } else if (direction === 'down' && itemIndex < data.length - 1) {
            [data[itemIndex], data[itemIndex + 1]] = [data[itemIndex + 1], data[itemIndex]]; // Swap
        }
        writeData(data);
    }
    res.redirect(`/${appName}/`);
});

// Download current JSON data
app.get(`/${appName}/download`, (req, res) => {
    res.download(DATA_FILE, 'mydata.json', (err) => {
        if (err) {
            console.error("Error downloading file:", err);
            // Check if headers have already been sent before sending status
            if (!res.headersSent) {
                res.status(500).send("Could not download the file.");
            }
        }
    });
});

// Upload JSON data
app.post(`/${appName}/upload`, upload.single('jsonFile'), (req, res) => {
    if (!req.file) {
        return res.redirect(`/${appName}/?message=` + encodeURIComponent('No file uploaded.'));
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
                 return res.redirect(`/${appName}/?message=` + encodeURIComponent('Uploaded file is not a valid JSON array.'));
            }

            writeData(uploadedJson); // Overwrite current data
            fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
            res.redirect(`/${appName}/?message=` + encodeURIComponent('JSON data uploaded successfully!'));
        } catch (parseError) {
            console.error("Error parsing uploaded JSON:", parseError);
            fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
            res.redirect(`/${appName}/?message=` + encodeURIComponent('Invalid JSON file uploaded.'));
        }
    });
});

// Your existing app.listen
app.listen(port, 'localhost', () => {
    console.log(`Service started at http://localhost:${port}/${appName}/`);
});
