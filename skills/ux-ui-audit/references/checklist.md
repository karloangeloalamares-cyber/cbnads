# UX/UI Audit Checklist

## Visual Parity

1. Match layout structure and container widths.
2. Match spacing scale and vertical rhythm.
3. Match typography size, weight, and line-height hierarchy.
4. Match border radius, shadows, and surface treatment.
5. Match icon size, stroke weight, and alignment.

## Component Quality

1. Ensure controls have clear labels and consistent wording.
2. Verify hover, focus, active, disabled, loading states.
3. Verify hit area is practical for pointer and touch.
4. Keep table/filter/action rows aligned and scannable.

## Interaction and Flow

1. Keep primary CTA obvious and stable.
2. Avoid layout shift on loading and filter changes.
3. Preserve user input on modal/dialog validation errors.
4. Confirm feedback after actions: success, error, empty state.

## Responsive Behavior

1. Validate desktop, tablet, and mobile breakpoints.
2. Prevent horizontal overflow unless intentionally scrollable.
3. Keep toolbar/filter controls readable when compressed.
4. Keep tables usable with truncation, wrapping, or priority columns.

## Accessibility Baseline

1. Verify keyboard traversal and focus visibility.
2. Verify meaningful labels for inputs/buttons/icons.
3. Verify contrast for text, placeholder, and status badges.
4. Verify semantic headings and table structures.

## Report Template

For each finding:

1. Severity: Critical/High/Medium/Low
2. Area: Layout, Typography, Interaction, Responsive, Accessibility
3. Evidence: expected vs actual
4. Suggested fix: precise CSS/markup/state change
