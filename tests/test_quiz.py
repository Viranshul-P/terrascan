from PIL import Image

from src.quiz import make_sprite, read_key, sprite_position


def test_sprite_position_goes_row_by_row():
    assert sprite_position(0, 9) == (0, 0)
    assert sprite_position(8, 9) == (8 * 64, 0)
    assert sprite_position(9, 9) == (0, 64)
    assert sprite_position(80, 9) == (8 * 64, 8 * 64)


def test_make_sprite_places_each_square():
    colours = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
    sheet = make_sprite([Image.new("RGB", (64, 64), c) for c in colours], cols=2)
    assert sheet.size == (128, 128)  # 3 squares in 2 columns -> 2 rows
    assert sheet.getpixel((10, 10)) == colours[0]
    assert sheet.getpixel((70, 10)) == colours[1]
    assert sheet.getpixel((10, 70)) == colours[2]


def test_read_key_follows_dots():
    assert read_key({"a": {"42": {"b": 0.5}}}, "a.42.b") == 0.5
