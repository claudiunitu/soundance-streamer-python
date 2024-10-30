import random
from typing import List
from pydub import AudioSegment
from enum import Enum

FINAL_TRACK_BIT_DEPTH = 32
FINAL_TRACK_SAMPLE_RATE = 44100


class SampleStitchingMethod(Enum):
    JOIN_WITH_OVERLAY = 2
    JOIN_WITH_CROSSFADE = 3


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


def translate_bit_depth_for_pydub(bit_depth: int):
    return bit_depth // 8


def get_bit_depth_from_audio_segment(file: AudioSegment):

    bit_depth = file.sample_width  # 1-4. 1=8 2=16 3=24 4=32

    if bit_depth == 1:
        bit_depth = 8

    elif bit_depth == 2:
        bit_depth = 16

    elif bit_depth == 3:
        bit_depth = 24

    elif bit_depth == 4:
        bit_depth = 32

    return bit_depth


def get_sample_rate(file: AudioSegment):

    return file.frame_rate


def create_soundtrack(
        samples_variations_filenames: List[str],
        max_volume_gain_db: int,
        min_volume_gain_db: int,
        max_length_seconds: int,
        fading_timeframe_seconds_min: int,
        fading_timeframe_seconds_max: int,
        sample_concat_overlay_seconds: float,
        sample_stitching_method: SampleStitchingMethod,
        bit_depth: int, sample_rate: int):
    # Initialize an empty audio segment with 0 duration for storing the concatenated sample
    original_concatenated_sample = AudioSegment.silent(duration=0)
    original_concatenated_sample.set_frame_rate(sample_rate)
    original_concatenated_sample.set_sample_width(translate_bit_depth_for_pydub(bit_depth))

    # Load the OGG sample (replace 'sample.ogg' with your actual file path)
    sample_variations_audio_segments: List[AudioSegment] = [AudioSegment.from_ogg(variation_filename) for
                                                            variation_filename in samples_variations_filenames]

    print(samples_variations_filenames[0] + ": bit depth " + str(get_bit_depth_from_audio_segment(sample_variations_audio_segments[0])) + ", sample rate: " + str(
        get_sample_rate(sample_variations_audio_segments[0])))

    processed_sample_milliseconds_length = max_length_seconds * 1000

    # Keep adding the sample variations until the processed sample is processedSampleMaxLength minutes
    while len(original_concatenated_sample) < processed_sample_milliseconds_length:

        # pick random sample variation to concatenate the final audio data
        random_sample_variation_index = random.randint(0, len(samples_variations_filenames) - 1)

        # print(f"Current concatenated length: {len(original_concatenated_sample)}")
        # print(f"Adding sample of length: {len(sample_variations_audio_segments[random_sample_variation_index])}")

        # make sure stitching overlay is not bigger than any of the stitched parts
        safe_sample_concat_overlay_milliseconds = sample_concat_overlay_seconds * 1000
        if len(original_concatenated_sample) - 1 < safe_sample_concat_overlay_milliseconds:
            safe_sample_concat_overlay_milliseconds = 0

        if sample_stitching_method == SampleStitchingMethod.JOIN_WITH_CROSSFADE:
            original_concatenated_sample = original_concatenated_sample.append(
                sample_variations_audio_segments[random_sample_variation_index],
                crossfade=safe_sample_concat_overlay_milliseconds)
        elif sample_stitching_method == SampleStitchingMethod.JOIN_WITH_OVERLAY:

            # Determine the position for the overlay
            overlay_position = len(original_concatenated_sample) - safe_sample_concat_overlay_milliseconds

            # Get the sample to overlay
            overlay_sample = sample_variations_audio_segments[random_sample_variation_index]

            # Calculate the length of the overlay sample
            overlay_length = len(overlay_sample)

            silence_duration = overlay_length - safe_sample_concat_overlay_milliseconds
            silence_segment = AudioSegment.silent(duration=silence_duration)
            silence_segment.set_frame_rate(sample_rate)
            silence_segment.set_sample_width(translate_bit_depth_for_pydub(bit_depth))

            original_concatenated_sample = original_concatenated_sample.append(silence_segment, crossfade=0)
            # Perform the overlay
            original_concatenated_sample = original_concatenated_sample.overlay(
                overlay_sample,
                position=overlay_position
            )
        else:
            return Exception("Unknown stitching method")

    # crop processed sample at exact processedSampleMaxLength
    original_concatenated_sample = original_concatenated_sample[:processed_sample_milliseconds_length]

    # Process originalConcatenatedSample by taking parts out of it and applying
    # fading effects then adding it to processedConcatenatedSample

    # Initialize an empty audio segment with 0 duration for concatenating processed parts of originalConcatenatedSample
    processed_concatenated_sample = AudioSegment.silent(duration=0)
    processed_concatenated_sample.set_frame_rate(sample_rate)
    processed_concatenated_sample.set_sample_width(translate_bit_depth_for_pydub(bit_depth))

    # create a mapping of how the originalConcatenatedSample will be processed further
    # split originalConcatenatedSample at random timing positions
    max_sample_segment_timeframe_milliseconds = fading_timeframe_seconds_max * 1000
    min_sample_segment_timeframe_milliseconds = fading_timeframe_seconds_min * 1000

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

        sample_segment = original_concatenated_sample[split_start_at_included:split_end_at_included + 1]

        segment_length = len(sample_segment)  # Use the full segment length for fade

        if segment_length > 0:
            processed_concatenated_sample += sample_segment.fade(
                from_gain=fade_from,
                to_gain=fade_to,
                start=0,
                end=len(sample_segment) - 1)

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


final_length_seconds = 5 * 60

print(0)
# Example: Create soundtracks
soundtrack_0 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/0a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/0b.ogg"],
    max_volume_gain_db=0,
    min_volume_gain_db=-60,
    max_length_seconds=final_length_seconds,
    fading_timeframe_seconds_min=10,
    fading_timeframe_seconds_max=20,
    sample_concat_overlay_seconds=0.2,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(1)
soundtrack_1 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/1a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/1b.ogg"],
    max_length_seconds=final_length_seconds,
    max_volume_gain_db=-15,
    min_volume_gain_db=-30,
    fading_timeframe_seconds_min=5 * 60,
    fading_timeframe_seconds_max=20 * 60,
    sample_concat_overlay_seconds=8,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(2)
soundtrack_2 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/2a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/2b.ogg"],
    max_length_seconds=final_length_seconds,
    max_volume_gain_db=-30,
    min_volume_gain_db=-90,
    fading_timeframe_seconds_min=5 * 60,
    fading_timeframe_seconds_max=20 * 60,
    sample_concat_overlay_seconds=6,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(3)
soundtrack_3 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/3a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/3b.ogg"],
    max_length_seconds=final_length_seconds,
    max_volume_gain_db=-40,
    min_volume_gain_db=-90,
    fading_timeframe_seconds_min=1 * 60,
    fading_timeframe_seconds_max=2 * 60,
    sample_concat_overlay_seconds=4,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(4)
soundtrack_4 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/4a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/4b.ogg"],
    max_length_seconds=final_length_seconds,
    max_volume_gain_db=-10,
    min_volume_gain_db=-30,
    fading_timeframe_seconds_min=5 * 60,
    fading_timeframe_seconds_max=10 * 60,
    sample_concat_overlay_seconds=7,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(5)
soundtrack_5 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/5a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/5b.ogg"],
    max_volume_gain_db=-5,
    min_volume_gain_db=-30,

    max_length_seconds=final_length_seconds,

    fading_timeframe_seconds_min=1 * 60,
    fading_timeframe_seconds_max=5 * 60,
    sample_concat_overlay_seconds=2.5,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(6)
soundtrack_6 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/6a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/6b.ogg"],
    max_volume_gain_db=-10,
    min_volume_gain_db=-50,
    max_length_seconds=final_length_seconds,
    fading_timeframe_seconds_min=1 * 60,
    fading_timeframe_seconds_max=2 * 60,
    sample_concat_overlay_seconds=4,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(7)
soundtrack_7 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/7a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/7b.ogg"],
    max_volume_gain_db=-10,
    min_volume_gain_db=-80,
    max_length_seconds=final_length_seconds,
    fading_timeframe_seconds_min=1 * 60,
    fading_timeframe_seconds_max=3 * 60,
    sample_concat_overlay_seconds=2.5,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(8)
soundtrack_8 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/8a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/8b.ogg"],
    max_volume_gain_db=-5,
    min_volume_gain_db=-40,
    max_length_seconds=final_length_seconds,
    fading_timeframe_seconds_min=1 * 60,
    fading_timeframe_seconds_max=6 * 60,
    sample_concat_overlay_seconds=4,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)
print(9)
soundtrack_9 = create_soundtrack(
    samples_variations_filenames=["./sound-samples/custom/full-spectrum-rain/9a.ogg",
                                  "./sound-samples/custom/full-spectrum-rain/9b.ogg"],
    max_volume_gain_db=-5,
    min_volume_gain_db=-40,
    max_length_seconds=final_length_seconds,
    fading_timeframe_seconds_min=1 * 60,
    fading_timeframe_seconds_max=4 * 60,
    sample_concat_overlay_seconds=4,
    sample_stitching_method=SampleStitchingMethod.JOIN_WITH_OVERLAY,
    bit_depth=FINAL_TRACK_BIT_DEPTH,
    sample_rate=FINAL_TRACK_SAMPLE_RATE
)

# Normalize both soundtracks before mixing
num_soundtracks = 10  # Adjust this based on the number of soundtracks you're mixing
normalized_soundtrack_1 = normalize_soundtrack(soundtrack_0, num_soundtracks)
normalized_soundtrack_2 = normalize_soundtrack(soundtrack_1, num_soundtracks)
normalized_soundtrack_3 = normalize_soundtrack(soundtrack_3, num_soundtracks)
normalized_soundtrack_4 = normalize_soundtrack(soundtrack_4, num_soundtracks)
normalized_soundtrack_5 = normalize_soundtrack(soundtrack_5, num_soundtracks)
normalized_soundtrack_6 = normalize_soundtrack(soundtrack_6, num_soundtracks)
normalized_soundtrack_7 = normalize_soundtrack(soundtrack_7, num_soundtracks)
normalized_soundtrack_8 = normalize_soundtrack(soundtrack_8, num_soundtracks)
normalized_soundtrack_9 = normalize_soundtrack(soundtrack_9, num_soundtracks)

# Mix the normalized soundtracks
final_track = (normalized_soundtrack_1
               .overlay(normalized_soundtrack_2)
               .overlay(normalized_soundtrack_3)
               .overlay(normalized_soundtrack_4)
               .overlay(normalized_soundtrack_5)
               .overlay(normalized_soundtrack_6)
               .overlay(normalized_soundtrack_7)
               .overlay(normalized_soundtrack_8)
               .overlay(normalized_soundtrack_9)
               )

print("Final track: bit depth " + str(get_bit_depth_from_audio_segment(final_track)) + ", sample rate: " + str(get_sample_rate(final_track)))

# Export the final track
final_track.export("processedConcatenatedSample.ogg", format="ogg")
