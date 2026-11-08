# OHP online reading and voting platform

Open index.html in a current Microsoft Edge or Chrome browser. The complete anonymous 107-case CT image collection is already under assets/. No model-asset ZIP or proprietary platform is needed. Alternatively run Open_Scoring_Platform.cmd to start a local server and open the platform in the default browser.

Public demonstration accounts are R01-R16; the demonstration password is OHP-DEMO-2026. Complete the unaided session first. The assisted session opens after the configured 15-day interval. Both sessions support CT slice scrolling, integer probability from 0 to 100, binary judgement and confidence from 1 to 5. The assisted session shows the patient-specific OHP probability and classification prompt. Pause/resume, progress backup and workbook export are available.

The study had 16 physicians: nine urologists and seven radiologists. Research session intervals were approximately 2-3 weeks. Public demonstration accounts and storage are separate from the formal study accounts and records. The patient risks are the fixed final model probabilities, using threshold 0.3530539465287861.

Case IDs match https://github.com/urologistChenyu/OHP-Paper-Data-Models/blob/main/data/predictions/reader_subset_107_predictions.csv. That research reference includes labels for independent analysis; the reading interface does not display pathological labels. No source identities, private clinical records, real account credentials or previous reader answers are provided.

The login gate is a local workflow control, not a secure clinical hosting service. Use institutional access controls for private patient data. For a public web demonstration, host this whole folder as static files, including all images. Do not change the supplied file structure.

## Related materials

[Paper data and final models](https://github.com/urologistChenyu/OHP-Paper-Data-Models) · [End-to-end application](https://github.com/urologistChenyu/OHP-End-to-End)

Version: v1.0.0. The repository source archive includes all demonstration images and can be used locally after extraction.
