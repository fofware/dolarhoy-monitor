# Copilot Instructions for DolarHoy Monitor Project

## Project Overview

This project is a TypeScript application that extracts and monitors currency exchange rates from [DolarHoy.com](https://dolarhoy.com/), specifically focusing on dollar exchange rates in Argentina. The application also includes automated browser scripts for SECHEEP and SAMEEP web portals using Playwright and Node.js.

## Key Components

1. **Web Scraping**: Uses axios to fetch the HTML content and cheerio for parsing
2. **Browser Automation**: Uses Playwright for automated login and data extraction from SECHEEP and SAMEEP portals
3. **Multiple Extraction Strategies**:
   - CSS selector-based extraction
   - Table structure analysis
   - Regular expressions for text pattern matching
4. **Latin American Number Format Handling**: Converts comma-decimal format to standard format
5. **Update Monitoring**: Polls the site every 5 minutes and checks for date changes
6. **Result Storage**: Saves data to JSON files with timestamps
7. **PDF Download**: Automated download of invoices and documents

## Key Files

- `src/index.ts`: Main DolarHoy scraping logic
- `src/index-secheep.ts`: SECHEEP portal automation with invoice extraction
- `src/index-sameep.ts`: SAMEEP portal automation with client management
- `package.json`: Project configuration and dependencies
- `.env`: Environment variables for credentials (SECHEEP_USER, SECHEEP_PASS, SAMEEP_USER, SAMEEP_PASS)

## Development Guidelines

### Coding Style

- Use TypeScript with strict type checking
- Prefer async/await over Promises
- Use meaningful variable and function names in Spanish
- Add JSDoc comments for complex functions
- Handle errors gracefully with try-catch blocks

### Browser Automation Best Practices

- Always use explicit waits instead of fixed timeouts when possible
- Take screenshots for debugging purposes
- Use robust selectors that are less likely to break
- Implement retry logic for unstable elements
- Close browser instances properly to avoid memory leaks

### File Organization

- Keep automation scripts in separate files
- Use consistent naming patterns
- Store downloaded files in organized folder structure
- Log important operations for debugging

### Security

- Never commit .env files with real credentials
- Use environment variables for sensitive data
- Implement proper error handling to avoid exposing credentials
- Validate and sanitize file paths and inputs

## Common Tasks

### Adding New Automation Scripts

- Follow the pattern established in existing scripts
- Use Playwright for browser automation
- Implement proper error handling and logging
- Add screenshots for debugging
- Include retry logic for unstable operations

### Debugging Automation Issues

- Use screenshots at key points
- Check browser console for JavaScript errors
- Verify selectors in browser developer tools
- Test with different wait strategies
- Log network requests and responses

### Performance Optimization

- Minimize unnecessary page loads
- Use efficient selectors
- Implement proper caching strategies
- Clean up resources (close browsers, files)
- Monitor memory usage for long-running processes
