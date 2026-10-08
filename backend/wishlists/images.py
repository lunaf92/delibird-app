"""Item images are re-encoded on upload: a predictable size and format, and no EXIF data such as GPS."""

from io import BytesIO

from django.core.files import File
from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_SIDE = 1600


class InvalidImage(Exception):
    pass


def normalise_image(upload: File[bytes]) -> ContentFile[bytes]:
    """Returns the upload as a JPEG no larger than MAX_SIDE on its longest side, without metadata."""
    if upload.size is not None and upload.size > MAX_UPLOAD_BYTES:
        raise InvalidImage("too large")
    try:
        with Image.open(upload) as original:
            original.load()
            image = ImageOps.exif_transpose(original)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise InvalidImage("unreadable") from error

    if image.mode in ("RGBA", "LA", "P"):
        # Transparent areas become white rather than black.
        image = image.convert("RGBA")
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.getchannel("A"))
        image = background
    else:
        image = image.convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))

    output = BytesIO()
    image.save(output, format="JPEG", quality=85, optimize=True)
    return ContentFile(output.getvalue(), name="image.jpg")
