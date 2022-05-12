class DocumentTooLarge extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

class UnsupportedDocument extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

const handler = async (event) => {
  const sizeLimit = 5242880;
  if (event.object.size > sizeLimit) {
    throw new DocumentTooLarge("Size limit is 5MB!");
  }
  const fileParts = event.object.key.split(".");
  const fileExtension = fileParts.pop().toLowerCase();
  if (fileParts.length === 0 || !["pdf", "png", "jpg", "jpeg", "tiff"].includes(fileExtension)) {
    throw new UnsupportedDocument("Allowed documents: PDF, PNG, JPG, JPEG and TIFF");
  }
  return event;
};

export { handler };
