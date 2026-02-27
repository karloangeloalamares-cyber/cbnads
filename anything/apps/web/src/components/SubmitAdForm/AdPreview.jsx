import { parseWhatsAppFormatting } from "@/utils/whatsappFormatter";

export function AdPreview({ formData }) {
  const data = formData || {};

  return (
    <div className="sticky top-8 flex items-center justify-center min-h-screen">
      <div className="flex justify-center">
        <div className="relative" style={{ width: "332px", height: "684px" }}>
          <svg
            width="332"
            height="684"
            viewBox="0 0 332 684"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.15))" }}
          >
            <path
              d="M5.57028 632.241L318.006 632.241V638.879C318.006 659.313 301.44 675.879 281.006 675.879H40.5703C21.2403 675.879 5.57028 660.209 5.57028 640.879L5.57028 632.241Z"
              fill="#EEEBE6"
            />
            <path
              d="M318.006 101.775L5.57043 101.775L5.57042 45.1213C5.57042 24.6868 22.1359 8.12125 42.5704 8.12125L283.006 8.12123C302.336 8.12122 318.006 23.7913 318.006 43.1212V101.775Z"
              fill="#EEEBE6"
            />
            <path
              d="M53.6721 0H278.328C306.657 0 329.628 23.052 329.628 51.4807V632.516C329.628 660.951 306.657 683.997 278.328 683.997H53.6721C25.3402 683.997 2.37226 660.951 2.37226 632.516V51.4807C2.37226 23.0488 25.3433 0 53.6721 0ZM6.46575 633.251C6.46575 658.954 27.2304 679.792 52.8397 679.792H278.951C304.56 679.792 325.325 658.954 325.325 633.251V50.7489C325.325 25.0494 304.56 4.21468 278.951 4.21468H52.8365C27.2273 4.21468 6.46262 25.0525 6.46262 50.752V633.251H6.46575Z"
              fill="#3A3A3A"
            />
            <path
              d="M278.951 679.936C304.601 679.936 325.469 658.991 325.469 633.248V50.7487C325.469 25.0084 304.601 4.06686 278.951 4.06686H52.8364C27.1865 4.06686 6.31854 25.0084 6.31854 50.7487V633.248C6.31854 658.991 27.1865 679.936 52.8364 679.936H278.951ZM278.603 11.7739C300.279 11.7739 317.914 29.468 317.914 51.2198V632.777C317.914 654.529 300.279 672.226 278.603 672.226H53.3966C31.7212 672.226 14.0861 654.529 14.0861 632.777V51.2198C14.0861 29.468 31.7212 11.7739 53.3966 11.7739H278.603Z"
              fill="#232323"
            />
            <path
              d="M197.382 46.8577H134.405C127.333 46.8577 121.599 41.1041 121.599 34.0064C121.599 26.9086 127.333 21.1551 134.405 21.1551H197.382C204.455 21.1551 210.188 26.9086 210.188 34.0064C210.188 41.1041 204.455 46.8577 197.382 46.8577Z"
              fill="#232323"
            />
          </svg>

          <div
            className="absolute"
            style={{
              top: "102px",
              left: "15px",
              right: "15px",
              bottom: "50px",
            }}
          >
            <div
              className="bg-[#ECE5DD] px-3 py-4 overflow-y-auto rounded-t-[18px]"
              style={{ height: "100%" }}
            >
              {data.ad_text || (data.media && data.media.length > 0) ? (
                <div className="bg-white rounded-lg shadow-sm overflow-hidden max-w-[90%]">
                  <div className="flex items-center gap-2 p-2.5 border-b border-gray-100">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-white p-1">
                      <img
                        src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
                        alt="CBN Unfiltered"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-[11px] font-semibold text-gray-900">CBN UNFILTERED</div>
                      <div className="text-[10px] text-gray-500">
                        {data.advertiser_name || "CBN Admin"}
                      </div>
                    </div>
                  </div>

                  {data.media && data.media.length > 0 && (
                    <div className="w-full">
                      <img
                        src={data.media[0].url}
                        alt="Ad media"
                        className="w-full h-auto"
                        style={{ maxHeight: "180px", objectFit: "cover" }}
                      />
                    </div>
                  )}

                  <div className="p-3">
                    <div className="text-[11px] text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                      {data.ad_text ? (
                        parseWhatsAppFormatting(data.ad_text)
                      ) : (
                        <span className="text-gray-400 italic">Your ad content will appear here...</span>
                      )}
                    </div>

                    <div className="text-[9px] text-gray-500 text-right mt-2">
                      {data.post_date_from && (
                        <>
                          {new Date(data.post_date_from).toLocaleDateString("en-US", {
                            month: "numeric",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                        </>
                      )}

                      {data.post_time
                        ? new Date(`2000-01-01T${data.post_time}`).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : "12:00 PM"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-500 text-[11px] px-4 max-w-[200px]">
                    Your ad preview will appear here as you fill in the form
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}