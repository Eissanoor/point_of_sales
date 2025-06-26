const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Function to upload image
const uploadImage = async (imagePath) => {
  try {
    const result = await cloudinary.uploader.upload(imagePath, {
      folder: 'products',
    });
    return result;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error('Image could not be uploaded');
  }
};

// Function to delete image
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw new Error('Image could not be deleted');
  }
};

// Extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  
  try {
    // Extract the public ID from the Cloudinary URL
    // Format: https://res.cloudinary.com/cloud-name/image/upload/v1234567890/products/image-id.jpg
    const splitUrl = url.split('/');
    const fileName = splitUrl[splitUrl.length - 1];
    const folderName = splitUrl[splitUrl.length - 2];
    
    // Return in format: products/image-id (without file extension)
    return `${folderName}/${fileName.split('.')[0]}`;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};

module.exports = { uploadImage, deleteImage, getPublicIdFromUrl }; 