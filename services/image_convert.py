from __future__ import annotations

import io

from PIL import Image, ImageOps

from services.config import config


def _convert_image_bytes(image_data: bytes, fmt: str, quality: int) -> bytes:
    """Convert image bytes to target format with given quality using Pillow."""
    with Image.open(io.BytesIO(image_data)) as img:
        img = ImageOps.exif_transpose(img)
        # Handle palette/grayscale modes for JPEG/WebP saving
        if fmt in ("jpeg", "webp"):
            if img.mode == "P":
                img = img.convert("RGBA" if img.info.get("transparency") is not None else "RGB")
            if img.mode == "RGBA":
                # JPEG doesn't support alpha; WebP does but we keep consistent
                if fmt == "jpeg":
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background
                else:
                    img = img.convert("RGB")
            elif img.mode != "RGB":
                img = img.convert("RGB")
        elif fmt == "png":
            if img.mode not in {"RGB", "RGBA", "P"}:
                img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        else:
            # fallback: keep original mode
            if img.mode not in {"RGB", "RGBA", "P", "L", "LA"}:
                img = img.convert("RGBA")

        buf = io.BytesIO()
        save_kwargs: dict[str, object] = {"format": fmt.upper(), "optimize": True}
        if fmt in ("jpeg", "webp"):
            save_kwargs["quality"] = quality
        img.save(buf, **save_kwargs)
        return buf.getvalue()


def convert_image_bytes(image_data: bytes, content_type: str = "image/png") -> bytes:
    """Convert image bytes according to current config settings.

    Returns converted bytes if conversion is configured, otherwise returns original bytes.
    """
    fmt = config.image_convert_format
    quality = config.image_convert_quality
    if not fmt:
        return image_data
    try:
        return _convert_image_bytes(image_data, fmt, quality)
    except Exception:
        # If conversion fails, return original bytes
        return image_data


def convert_uploaded_image(image_data: bytes, content_type: str = "image/png") -> bytes:
    """Convert user-uploaded image if the config option is enabled.

    Returns converted bytes if conversion is configured and enabled for uploads,
    otherwise returns original bytes.
    """
    if not config.image_convert_uploaded:
        return image_data
    return convert_image_bytes(image_data, content_type)
