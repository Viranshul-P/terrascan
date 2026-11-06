from src.web_checks import check_squares


def test_check_squares_maps_pixels_to_square_ids_and_verdicts():
    sample = [
        {"pair": "pair_00", "row": "2304", "col": "1600", "lon": "72.5", "lat": "22.9"},
        {"pair": "pair_01", "row": "0", "col": "64", "lon": "72.4", "lat": "23.1"},
    ]
    reviewed = [{"pair": "pair_01", "final": "no"}, {"pair": "pair_00", "final": "yes"}]
    out = check_squares(sample, reviewed, grid_cols=48)
    # pixel row 2304 -> square row 36; pixel col 1600 -> square col 25; id = 36 * 48 + 25
    expected = {"pair": "pair_00", "id": 36 * 48 + 25, "lon": 72.5, "lat": 22.9, "verdict": "yes"}
    assert out[0] == expected
    assert out[1]["id"] == 1 and out[1]["verdict"] == "no"
