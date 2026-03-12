Run the Gene Story code review agent on a specific file.

Usage: /review <file_path>

Example: /review api/routes/genes.py

This will:
1. Read the specified file
2. Send it to Claude for a plain-English review
3. Check documentation, code quality, error handling, and security
4. Save the report to REVIEW_REPORT.md
5. Print the report to the terminal

The review is written for mixed audiences — biologists and developers alike.

```bash
python agents/review_agent.py $ARGUMENTS
```
