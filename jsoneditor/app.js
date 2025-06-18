const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // New: For file uploads

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'mydata.json');

// New: Multer setup for file uploads
const upload = multer({ dest: 'uploads/' }); // Temporary directory for uploaded files

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'))); // For any future static assets like CSS/JS

// Helper to read data
const readData = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading data file:", error.message);
        return []; // Return empty array if file not found or invalid JSON
    }
};

// Helper to write data
const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Error writing data file:", error.message);
    }
};

// Routes

// Home page - display current data
app.get('/', (req, res) => {
    const data = readData();
    res.render('index', { data: data, message: req.query.message || null }); // Pass message for success/error
});

// Add new item
app.post('/add', (req, res) => {
    const data = readData();
    const newItem = {
        id: 'item' + (data.length + 1 + Date.now().toString().slice(-4)), // Slightly better ID generation
        title: req.body.title || 'New Item',
        description: req.body.description || ''
    };
    data.push(newItem);
    writeData(data);
    res.redirect('/');
});

// Update item
app.post('/update', (req, res) => {
    const data = readData();
    const { id, title, description } = req.body;
    const itemIndex = data.findIndex(item => item.id === id);

    if (itemIndex > -1) {
        data[itemIndex].title = title;
        data[itemIndex].description = description;
        writeData(data);
    }
    res.redirect('/');
});

// Delete item
app.post('/delete', (req, res) => {
    const data = readData();
    const { id } = req.body;
    const newData = data.filter(item => item.id !== id);
    writeData(newData);
    res.redirect('/');
});

// Reorder items (move up/down)
app.post('/move', (req, res) => {
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
    res.redirect('/');
});

// New: Download current JSON data
app.get('/download', (req, res) => {
    res.download(DATA_FILE, 'mydata.json', (err) => {
        if (err) {
            console.error("Error downloading file:", err);
            res.status(500).send("Could not download the file.");
        }
    });
});

// New: Upload JSON data
app.post('/upload', upload.single('jsonFile'), (req, res) => {
    if (!req.file) {
        return res.redirect('/?message=' + encodeURIComponent('No file uploaded.'));
    }

    const uploadedFilePath = req.file.path;

    fs.readFile(uploadedFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading uploaded file:", err);
            fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
            return res.redirect('/?message=' + encodeURIComponent('Error reading uploaded file.'));
        }

        try {
            const uploadedJson = JSON.parse(data);
            // Optional: Basic validation to ensure it's an array or expected structure
            if (!Array.isArray(uploadedJson)) {
                 fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
                 return res.redirect('/?message=' + encodeURIComponent('Uploaded file is not a valid JSON array.'));
            }

            writeData(uploadedJson); // Overwrite current data
            fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
            res.redirect('/?message=' + encodeURIComponent('JSON data uploaded successfully!'));
        } catch (parseError) {
            console.error("Error parsing uploaded JSON:", parseError);
            fs.unlink(uploadedFilePath, () => {}); // Clean up temp file
            res.redirect('/?message=' + encodeURIComponent('Invalid JSON file uploaded.'));
        }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
