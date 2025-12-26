const multer = require('multer');
const path = require('path');

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();

// Check file type for images
const imageFileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Images only! Please upload an image file (jpeg, jpg, png, webp)'));
  }
};

// Check file type for attachments (images, PDFs, documents)
const attachmentFileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|webp|pdf|doc|docx|xls|xlsx/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetypes = /image\/(jpeg|jpg|png|webp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)/;
  const mimetype = mimetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type! Please upload an image (jpeg, jpg, png, webp), PDF, or document (doc, docx, xls, xlsx)'));
  }
};

// Initialize upload for images
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
  fileFilter: imageFileFilter,
});

// Initialize upload for attachments (allows larger files and more types)
const uploadForAttachments = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 10 }, // 10MB limit for attachments
  fileFilter: attachmentFileFilter,
});

// Multiple file upload middleware
const uploadMultiple = upload.array('images', 10); // Allow up to 10 images

// Multiple attachments upload middleware (for documents, PDFs, etc.)
const uploadAttachments = uploadForAttachments.array('attachments', 10); // Allow up to 10 attachments

// Single attachment upload middleware (for one file)
const uploadSingleAttachment = uploadForAttachments.single('attachment'); // Single file upload

module.exports = {
  upload,
  uploadMultiple,
  uploadAttachments,
  uploadSingleAttachment,
}; 