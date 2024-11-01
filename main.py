import json
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
        sample_stitching_method: str,  # "JOIN_WITH_OVERLAY", "JOIN_WITH_CROSSFADE"
        bit_depth: int, sample_rate: int):
    # Initialize an empty audio segment with 0 duration for storing the concatenated sample
    original_concatenated_sample = AudioSegment.silent(duration=0)
    original_concatenated_sample.set_frame_rate(sample_rate)
    original_concatenated_sample.set_sample_width(translate_bit_depth_for_pydub(bit_depth))

    # Load sample
    sample_variations_audio_segments: List[AudioSegment] = [AudioSegment.from_file(variation_filename) for
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

        if sample_stitching_method == "JOIN_WITH_CROSSFADE":
            original_concatenated_sample = original_concatenated_sample.append(
                sample_variations_audio_segments[random_sample_variation_index],
                crossfade=safe_sample_concat_overlay_milliseconds)
        elif sample_stitching_method == "JOIN_WITH_OVERLAY":

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

    if processed_sample_milliseconds_length <= min_sample_segment_timeframe_milliseconds:
        raise Exception(samples_variations_filenames[0] + ": the sample length is shorter than its minimum fading timeframe")

    # fill the mapping array with maximum elements that the algorithm can possibly fill
    # (if it always chooses minimum random intervals when it splits originalConcatenatedSample into segments )
    maximum_hypotetical_possible_sample_segments = int(
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


def normalize_soundtrack(audio_track: AudioSegment, num_tracks: int) -> AudioSegment:
    # Calculate peak level
    peak_level = audio_track.max_dBFS

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
    normalized_soundtrack = audio_track.apply_gain(-normalization_gain)

    return normalized_soundtrack


def safe_ratio_to_db(ratio):
    if ratio == 0:
        return -120.0  # or some large negative value representing silence
    if ratio < 0:
        raise ValueError("Ratio must be non-negative.")

    return math.floor(ratio_to_db(ratio))


def audio_format_to_file_extension(audio_format: str):
    if audio_format == "mp3":
        return "mp3"
    elif audio_format == "adts":
        return "aac"
    elif audio_format == "ogg":
        return "ogg"


with open("currentConfig.json", "r") as file:
    jsonData = json.load(file)

    FINAL_TRACK_BIT_DEPTH = jsonData["bitDepth"]
    FINAL_TRACK_SAMPLE_RATE = jsonData["sampleRate"]
    final_length_seconds = int(jsonData["lengthMs"] // 1000)
    audio_format = jsonData["format"]
    samples_data_config = jsonData["sampleDataConfig"]

    final_track = AudioSegment.silent(duration=final_length_seconds*1000, frame_rate=FINAL_TRACK_SAMPLE_RATE)
    normalized_processed_sound_tracks:  List[AudioSegment] = []

    number_of_tracks = len(samples_data_config)

    for i in range(number_of_tracks):

        print("Creating track: " + str(i+1) + " of " + str(number_of_tracks))

        current_sample_data_config = samples_data_config[i]
        current_sample_stitching_method = current_sample_data_config["params"]["stitchingMethod"]
        current_sample_concat_overlay_milliseconds = current_sample_data_config["params"]["concatOverlayMs"]

        soundtrack = create_soundtrack(
            samples_variations_filenames=current_sample_data_config["variationFilePath"],
            max_volume_gain_db=safe_ratio_to_db(current_sample_data_config["params"]["maxVolRatio"]),
            min_volume_gain_db=safe_ratio_to_db(current_sample_data_config["params"]["minVolRatio"]),
            max_length_seconds=final_length_seconds,
            fading_timeframe_seconds_min=int(current_sample_data_config["params"]["minTimeframeLengthMs"]/1000),
            fading_timeframe_seconds_max=int(current_sample_data_config["params"]["maxTimeframeLengthMs"]/1000),
            sample_concat_overlay_seconds=int(current_sample_concat_overlay_milliseconds/1000),
            sample_stitching_method=current_sample_stitching_method,
            bit_depth=32,  # set maximum bit depth for processing
            sample_rate=44100
        )

        final_track = final_track.overlay(normalize_soundtrack(soundtrack, number_of_tracks))

    final_track.set_frame_rate(FINAL_TRACK_SAMPLE_RATE)
    final_track.set_sample_width(translate_bit_depth_for_pydub(FINAL_TRACK_BIT_DEPTH))
    print("Final track: bit depth " + str(get_bit_depth_from_audio_segment(final_track)) + ", sample rate: " + str(get_sample_rate(final_track)))
    print("Exporting...")
    # Export the final track
    final_track.export("processedConcatenatedSample."+audio_format_to_file_extension(audio_format), format=audio_format)
