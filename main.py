import math
import random
from typing import List

from pydub import AudioSegment
from pydub.utils import ratio_to_db


class SampleSplittingSegmentMap:
    def __init__(
            self,
            split_start_at_included: int | None,
            split_end_at_included: int | None,
            fade_from: int | None,
            fade_to: int | None):
        self.split_start_at_included = split_start_at_included
        self.split_end_at_included = split_end_at_included
        self.fade_from = fade_from
        self.fade_to = fade_to


def create_soundtrack(
        samples_variations_filenames: List[str],
        max_length_seconds: int,
        fading_timeframe_seconds_min: int,
        fading_timeframe_seconds_max: int):

    # Initialize an empty audio segment with 0 duration for storing the concatenated sample
    original_concatenated_sample = AudioSegment.silent(duration=0)

    # Load the OGG sample (replace 'sample.ogg' with your actual file path)
    sample_variations_audio_segments: List[AudioSegment] = [AudioSegment.from_ogg(variation_filename) for variation_filename in samples_variations_filenames]

    processed_sample_milliseconds_length = max_length_seconds * 1000

    # Keep adding the sample variations until the processed sample is processedSampleMaxLength minutes
    while len(original_concatenated_sample) < processed_sample_milliseconds_length:

        # pick random sample variation to concatenate the final audio data
        random_sample_variation_index = random.randint(0, len(samples_variations_filenames)-1)
        original_concatenated_sample += sample_variations_audio_segments[random_sample_variation_index]
        print(random_sample_variation_index, len(samples_variations_filenames))

    # crop processed sample at exact processedSampleMaxLength
    original_concatenated_sample = original_concatenated_sample[:processed_sample_milliseconds_length]

    # Process originalConcatenatedSample by taking parts out of it and applying
    # fading effects then adding it to processedConcatenatedSample

    # Initialize an empty audio segment with 0 duration for concatenating processed parts of originalConcatenatedSample
    processed_concatenated_sample = AudioSegment.silent(duration=0)

    # create a mapping of how the originalConcatenatedSample will be processed further
    # split originalConcatenatedSample at random timing positions
    max_sample_segment_timeframe_milliseconds = fading_timeframe_seconds_max * 1000
    min_sample_segment_timeframe_milliseconds = fading_timeframe_seconds_min * 1000

    # each split segment will be able to fade to specified values
    max_volume_gain_db = 0
    min_volume_gain_db = -30

    # fill the mapping array with maximum elements that the algorithm can possibly fill
    # (if it always chooses minimum random intervals when it splits originalConcatenatedSample into segments )
    maximum_hypotetical_possible_sample_segments = (
            processed_sample_milliseconds_length // min_sample_segment_timeframe_milliseconds)
    sample_processing_mapping: List[SampleSplittingSegmentMap] = [
        SampleSplittingSegmentMap(
            split_start_at_included=None,
            split_end_at_included=None,
            fade_from=None,
            fade_to=None
        ) for _ in range(maximum_hypotetical_possible_sample_segments)
    ]

    # temp variables
    _lastSegmentVolumeEnd = random.randint(min_volume_gain_db, max_volume_gain_db)
    _lastSegmentSplitEndIncluded = -1
    _originalSampleLength = len(original_concatenated_sample)
    _mappedSegmentsCount = 0

    for i in range(len(sample_processing_mapping)):

        random_segment_duration = random.randint(
            min_sample_segment_timeframe_milliseconds,
            max_sample_segment_timeframe_milliseconds)
        random_fade_to = random.randint(min_volume_gain_db, max_volume_gain_db)

        sample_processing_mapping[i].split_start_at_included = _lastSegmentSplitEndIncluded + 1
        sample_processing_mapping[i].split_end_at_included = min(
            _originalSampleLength,
            sample_processing_mapping[i].split_start_at_included + random_segment_duration)
        sample_processing_mapping[i].fade_from = _lastSegmentVolumeEnd
        sample_processing_mapping[i].fade_to = random_fade_to

        _lastSegmentSplitEndIncluded = sample_processing_mapping[i].split_end_at_included
        _lastSegmentVolumeEnd = sample_processing_mapping[i].fade_to
        _mappedSegmentsCount = i + 1

        if sample_processing_mapping[i].split_start_at_included >= _originalSampleLength:
            break

    # discard the unfilled SampleSplittingSegmentMap items
    sample_processing_mapping = sample_processing_mapping[:_mappedSegmentsCount]

    # split segments and apply fading according to the mapping
    for i in range(len(sample_processing_mapping)):

        split_start_at_included = sample_processing_mapping[i].split_start_at_included
        split_end_at_included = sample_processing_mapping[i].split_end_at_included

        fade_from = sample_processing_mapping[i].fade_from
        fade_to = sample_processing_mapping[i].fade_to

        sample_segment = original_concatenated_sample[split_start_at_included:split_end_at_included+1]

        segment_length = len(sample_segment)  # Use the full segment length for fade

        if segment_length > 0:
            processed_concatenated_sample += sample_segment.fade(
                from_gain=fade_from,
                to_gain=fade_to,
                start=0,
                end=len(sample_segment)-1)

    return processed_concatenated_sample


def normalize_soundtrack(soundtrack: AudioSegment, num_tracks: int) -> AudioSegment:
    # Calculate peak level
    peak_level = soundtrack.max_dBFS

    # Calculate normalization gain
    # Set a maximum peak level (in dB)
    max_peak_level = 0  # dBFS level at which clipping occurs

    # Calculate the adjustment needed
    # If peak_level is already at or above max_peak_level, we need to reduce
    if peak_level > max_peak_level:
        gain_reduction = peak_level - max_peak_level
        # Apply a reduction based on the number of tracks
        # To avoid clipping when mixed, we reduce more depending on the number of tracks
        normalization_gain = gain_reduction + (gain_reduction / num_tracks)
    else:
        normalization_gain = 0  # No gain adjustment needed

    # Normalize the soundtrack
    normalized_soundtrack = soundtrack.apply_gain(-normalization_gain)

    return normalized_soundtrack


# Example: Create soundtracks
soundtrack_1 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/demo/sample1a.ogg", "./sound-samples/demo/sample1b.ogg"],
    max_length_seconds=2 * 60,
    fading_timeframe_seconds_min=2,
    fading_timeframe_seconds_max=5
)

soundtrack_2 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/demo/sample2a.ogg", "./sound-samples/demo/sample2b.ogg"],
    max_length_seconds=2 * 60,
    fading_timeframe_seconds_min=2,
    fading_timeframe_seconds_max=5
)

# Normalize both soundtracks before mixing
num_soundtracks = 2  # Adjust this based on the number of soundtracks you're mixing
normalized_soundtrack_1 = normalize_soundtrack(soundtrack_1, num_soundtracks)
normalized_soundtrack_2 = normalize_soundtrack(soundtrack_2, num_soundtracks)

# Mix the normalized soundtracks
final_track = normalized_soundtrack_1.overlay(normalized_soundtrack_2)

# Export the final track
final_track.export("processedConcatenatedSample.ogg", format="ogg")