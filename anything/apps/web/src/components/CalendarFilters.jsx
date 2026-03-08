"use client";

export default function CalendarFilters({
  selectedAdvertiser,
  setSelectedAdvertiser,
  selectedPlacement,
  setSelectedPlacement,
  selectedPostType,
  setSelectedPostType,
  selectedStatus,
  setSelectedStatus,
  showUnpublishedOnly,
  setShowUnpublishedOnly,
  advertisers,
  placements,
  postTypes,
}) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <select
          value={selectedAdvertiser}
          onChange={(event) => setSelectedAdvertiser(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Advertisers</option>
          {advertisers.map((advertiser) => (
            <option key={advertiser} value={advertiser}>
              {advertiser}
            </option>
          ))}
        </select>

        <select
          value={selectedPlacement}
          onChange={(event) => setSelectedPlacement(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Placements</option>
          {placements.map((placement) => (
            <option key={placement} value={placement}>
              {placement}
            </option>
          ))}
        </select>

        <select
          value={selectedPostType}
          onChange={(event) => setSelectedPostType(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Post Types</option>
          {postTypes.map((postType) => (
            <option key={postType} value={postType}>
              {postType}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(event) => setSelectedStatus(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Statuses</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Published">Published</option>
          <option value="Paid">Paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>

        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={showUnpublishedOnly}
            onChange={(event) => setShowUnpublishedOnly(event.target.checked)}
            className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
          />
          <span className="text-gray-700">Unpublished only</span>
        </label>
      </div>
    </div>
  );
}
