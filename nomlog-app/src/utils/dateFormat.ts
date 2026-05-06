/**
 * Formats a date for display in the date picker widget
 * Returns formats like:
 * - "Today at 08:07 AM" for today
 * - "Yesterday at 08:07 AM" for yesterday
 * - "Jan 15 at 08:07 AM" for other dates
 */
export function formatMealDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Format time
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  const timeString = `${displayHours}:${displayMinutes} ${ampm}`;

  // Determine if it's today, yesterday, or another date
  if (dateOnly.getTime() === today.getTime()) {
    return `Today at ${timeString}`;
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday at ${timeString}`;
  } else {
    // Format as "MMM DD at HH:MM AM/PM"
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    return `${month} ${day} at ${timeString}`;
  }
}

/**
 * Formats time for display in meal suggestions
 * Returns format like: "3:45 PM"
 */
export function formatSuggestionTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
}

