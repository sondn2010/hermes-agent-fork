import { defineFieldCopy } from '@/app/settings/field-copy'

import { defineLocale } from './define-locale'

export const vi = defineLocale({
  common: {
    apply: 'Áp dụng',
    back: 'Quay lại',
    save: 'Lưu',
    saving: 'Đang lưu…',
    cancel: 'Hủy',
    change: 'Thay đổi',
    choose: 'Chọn',
    clear: 'Xóa',
    close: 'Đóng',
    collapse: 'Thu gọn',
    confirm: 'Xác nhận',
    connect: 'Kết nối',
    connecting: 'Đang kết nối',
    continue: 'Tiếp tục',
    copied: 'Đã sao chép',
    copy: 'Sao chép',
    copyFailed: 'Sao chép thất bại',
    delete: 'Xóa',
    docs: 'Tài liệu',
    done: 'Hoàn thành',
    error: 'Lỗi',
    expand: 'Mở rộng',
    failed: 'Thất bại',
    loading: 'Đang tải…',
    refresh: 'Làm mới',
    remove: 'Loại bỏ',
    retry: 'Thử lại',
    run: 'Chạy',
    send: 'Gửi',
    set: 'Đặt',
    skip: 'Bỏ qua',
    update: 'Cập nhật',
    on: 'Bật',
    off: 'Tắt'
  },

  boot: {
    ready: 'Hermes Desktop đã sẵn sàng',
    desktopBootFailedWithMessage: message => `Khởi động Desktop thất bại: ${message}`,
    steps: {
      connectingGateway: 'Đang kết nối gateway desktop live',
      loadingSettings: 'Đang tải cài đặt Hermes',
      loadingSessions: 'Đang tải các phiên gần đây',
      startingDesktopConnection: 'Đang khởi động kết nối desktop',
      startingHermesDesktop: 'Đang khởi động Hermes Desktop…'
    }
  },

  sidebar: {
    nav: {
      'new-session': 'Phiên mới',
      skills: 'Tính năng',
      messaging: 'Nhắn tin',
      artifacts: 'Sản phẩm',
      cron: 'Công việc định kỳ'
    },
    searchPlaceholder: 'Tìm kiếm phiên…',
    noMatch: query => `Không tìm thấy phiên nào khớp với “${query}”.`,
    results: 'Kết quả',
    pinned: 'Đã ghim',
    sessions: 'Phiên làm việc',
    cronJobs: 'Lịch trình',
    allPinned: 'Mọi thứ ở đây đã được ghim. Bỏ ghim một cuộc trò chuyện để hiển thị nó trong danh sách gần đây.',
    shiftClickHint: 'Shift-click một cuộc trò chuyện để ghim',
    noWorkspace: 'Không có không gian làm việc',
    projectEmpty: 'Chưa có phiên làm việc nào',
    noSessions: 'Chưa có phiên làm việc nào',
    noFilterMatches: 'Không có phiên nào khớp với các bộ lọc này'
  },

  keybinds: {
    actions: {
      'session.new': 'Phiên mới',
      'session.newTab': 'Tab phiên mới',
      'session.newWindow': 'Cửa sổ mới'
    }
  },

  commandCenter: {
    nav: {
      newChat: { title: 'Phiên mới', detail: 'Bắt đầu một phiên làm việc mới' },
      settings: { title: 'Cài đặt', detail: 'Cấu hình Hermes Desktop' },
      skills: { title: 'Tính năng', detail: 'Skills, tools, và các MCP Server' },
      messaging: { title: 'Nhắn tin', detail: 'Thiết lập Telegram, Slack, Discord, và các nền tảng khác' },
      artifacts: { title: 'Sản phẩm', detail: 'Duyệt qua các sản phẩm đầu ra đã tạo' }
    }
  },

  artifacts: {
    search: 'Tìm kiếm sản phẩm...',
    refresh: 'Làm mới sản phẩm',
    refreshing: 'Đang làm mới sản phẩm',
    indexing: 'Đang chỉ mục sản phẩm của phiên gần đây',
    tabAll: 'Tất cả',
    tabImages: 'Hình ảnh',
    tabFiles: 'Tệp tin',
    tabLinks: 'Liên kết',
    noArtifactsTitle: 'Không tìm thấy sản phẩm nào',
    noArtifactsDesc: 'Hình ảnh và tệp đầu ra được tạo sẽ xuất hiện ở đây khi các phiên hoạt động tạo ra chúng.',
    failedLoad: 'Tải sản phẩm thất bại',
    openFailed: 'Mở thất bại'
  },

  language: {
    label: 'Ngôn ngữ',
    description: 'Chọn ngôn ngữ cho giao diện Desktop.',
    saving: 'Đang lưu ngôn ngữ…',
    saveError: 'Cập nhật ngôn ngữ thất bại',
    switchTo: 'Chuyển đổi ngôn ngữ',
    searchPlaceholder: 'Tìm kiếm ngôn ngữ…',
    noResults: 'Không tìm thấy ngôn ngữ nào'
  },

  settings: {
    closeSettings: 'Đóng cài đặt',
    exportConfig: 'Xuất cấu hình',
    importConfig: 'Nhập cấu hình',
    resetToDefaults: 'Khôi phục mặc định',
    resetConfirm: 'Khôi phục tất cả cài đặt về mặc định của Hermes?',
    exportFailed: 'Xuất thất bại',
    resetFailed: 'Khôi phục thất bại',
    nav: {
      providers: 'Nhà cung cấp',
      providerAccounts: 'Tài khoản',
      providerApiKeys: 'API key',
      providerCustomEndpoints: 'Endpoint tùy chỉnh',
      gateway: 'Gateway',
      connections: 'Kết nối',
      apiKeys: 'Tool & Key',
      keybinds: 'Phím tắt',
      keysTools: 'Tool',
      keysSettings: 'Cài đặt',
      mcp: 'MCP',
      archivedChats: 'Cuộc trò chuyện đã lưu trữ',
      about: 'Giới thiệu',
      billing: 'Thanh toán',
      notifications: 'Thông báo',
      plugins: 'Plugin'
    },
    fieldLabels: defineFieldCopy({
      model: 'Model mặc định',
      modelContextLength: 'Context Window',
      fallbackProviders: 'Model dự phòng',
      toolsets: 'Toolsets đã kích hoạt',
      timezone: 'Múi giờ',
      display: {
        personality: 'Personality',
        showReasoning: 'Hiện khối lập luận'
      },
      desktop: {
        repoScanEnabled: 'Tự động quét kho mã nguồn',
        repoScanRoots: 'Thư mục quét kho mã nguồn',
        repoScanExcludePaths: 'Đường dẫn kho mã nguồn cần loại trừ'
      },
      agent: {
        maxTurns: 'Số bước Agent tối đa',
        imageInputMode: 'Ảnh đính kèm',
        apiMaxRetries: 'Số lần thử lại API',
        serviceTier: 'Phân cấp dịch vụ',
        toolUseEnforcement: 'Bắt buộc dùng Tool'
      },
      terminal: {
        cwd: 'Thư mục làm việc',
        backend: 'Backend thực thi',
        timeout: 'Thời gian chờ lệnh',
        persistentShell: 'Shell liên tục',
        envPassthrough: 'Truyền biến môi trường',
        dockerImage: 'Docker Image',
        singularityImage: 'Singularity Image',
        modalImage: 'Modal Image',
        daytonaImage: 'Daytona Image'
      },
      fileReadMaxChars: 'Giới hạn đọc tệp',
      toolOutput: {
        maxBytes: 'Giới hạn đầu ra Terminal',
        maxLines: 'Giới hạn phân trang tệp',
        maxLineLength: 'Giới hạn độ dài dòng'
      },
      codeExecution: {
        mode: 'Chế độ thực thi mã'
      },
      approvals: {
        mode: 'Chế độ phê duyệt',
        timeout: 'Thời gian chờ phê duyệt',
        mcpReloadConfirm: 'Xác nhận tải lại MCP'
      },
      commandAllowlist: 'Danh sách lệnh được phép',
      security: {
        redactSecrets: 'Ẩn thông tin nhạy cảm',
        allowPrivateUrls: 'Cho phép URL nội bộ'
      },
      browser: {
        allowPrivateUrls: 'Trình duyệt URL nội bộ',
        autoLocalForPrivateUrls: 'Trình duyệt cục bộ cho URL nội bộ'
      },
      checkpoints: {
        enabled: 'Điểm khôi phục tệp',
        maxSnapshots: 'Giới hạn điểm khôi phục'
      },
      voice: {
        recordKey: 'Phím tắt giọng nói',
        maxRecordingSeconds: 'Độ dài ghi âm tối đa',
        autoTts: 'Đọc to phản hồi'
      },
      stt: {
        enabled: 'Chuyển giọng nói thành văn bản',
        echoTranscripts: 'Hiển thị bản ghi âm',
        provider: 'Nhà cung cấp STT',
        local: {
          model: 'Model chuyển đổi cục bộ',
          language: 'Ngôn ngữ chuyển đổi'
        },
        openai: {
          model: 'Model OpenAI STT'
        },
        groq: {
          model: 'Model Groq STT'
        },
        mistral: {
          model: 'Model Mistral STT'
        },
        elevenlabs: {
          modelId: 'Model ElevenLabs STT',
          languageCode: 'Ngôn ngữ ElevenLabs',
          tagAudioEvents: 'Gắn thẻ sự kiện âm thanh',
          diarize: 'Phân biệt người nói'
        }
      },
      tts: {
        provider: 'Nhà cung cấp văn bản thành giọng nói',
        edge: {
          voice: 'Giọng nói Edge'
        },
        openai: {
          model: 'Model OpenAI TTS',
          voice: 'Giọng nói OpenAI'
        },
        elevenlabs: {
          voiceId: 'Giọng nói ElevenLabs',
          modelId: 'Model ElevenLabs'
        },
        xai: {
          voiceId: 'Giọng nói xAI (Grok)',
          language: 'Ngôn ngữ xAI',
          speed: 'Tốc độ phát xAI',
          autoSpeechTags: 'Tự động gắn thẻ giọng nói xAI',
          optimizeStreamingLatency: 'Tối ưu hóa độ trễ phát trực tiếp xAI',
          sampleRate: 'Tần số lấy mẫu xAI',
          bitRate: 'Tỷ lệ bit xAI'
        },
        minimax: {
          model: 'Model MiniMax TTS',
          voiceId: 'Giọng nói MiniMax'
        },
        mistral: {
          model: 'Model Mistral TTS',
          voiceId: 'Giọng nói Mistral'
        },
        gemini: {
          model: 'Model Gemini TTS',
          voice: 'Giọng nói Gemini'
        },
        neutts: {
          model: 'Model NeuTTS',
          device: 'Thiết bị NeuTTS'
        },
        kittentts: {
          model: 'Model KittenTTS',
          voice: 'Giọng nói KittenTTS'
        },
        piper: {
          voice: 'Giọng nói Piper'
        },
        deepinfra: {
          model: 'Model DeepInfra TTS',
          voice: 'Giọng nói DeepInfra'
        }
      },
      memory: {
        memoryEnabled: 'Bộ nhớ dài hạn',
        userProfileEnabled: 'Hồ sơ người dùng',
        memoryCharLimit: 'Giới hạn bộ nhớ',
        userCharLimit: 'Giới hạn hồ sơ',
        provider: 'Nhà cung cấp bộ nhớ'
      },
      context: {
        engine: 'Cơ chế ngữ cảnh'
      },
      compression: {
        enabled: 'Tự động nén',
        threshold: 'Ngưỡng nén',
        targetRatio: 'Tỷ lệ nén mục tiêu',
        protectLastN: 'Bảo vệ số tin nhắn gần đây'
      },
      delegation: {
        model: 'Model Subagent',
        provider: 'Nhà cung cấp Subagent',
        maxIterations: 'Giới hạn bước Subagent',
        maxConcurrentChildren: 'Số Subagent song song',
        childTimeoutSeconds: 'Thời gian chờ Subagent',
        reasoningEffort: 'Mức độ suy luận Subagent'
      },
      updates: {
        nonInteractiveLocalChanges: 'Cập nhật thay đổi cục bộ trong ứng dụng'
      }
    }),
    fieldDescriptions: defineFieldCopy({
      model: 'Được sử dụng cho các cuộc trò chuyện mới trừ khi bạn chọn một model khác trong ô soạn thảo.',
      modelContextLength: 'Để là 0 để sử dụng cửa sổ ngữ cảnh được phát hiện tự động của model đã chọn.',
      fallbackProviders: 'Các mục provider:model dự phòng để thử nếu model mặc định bị lỗi.',
      display: {
        personality: 'Phong cách trợ lý mặc định cho các phiên mới.',
        showReasoning: 'Hiển thị các phần suy luận/lập luận khi backend cung cấp.'
      },
      desktop: {
        repoScanEnabled: 'Quét các thư mục cục bộ để tìm kho Git hiển thị trong mục Dự án.',
        repoScanRoots: 'Các thư mục cần quét. Để trống để quét thư mục cá nhân của bạn.',
        repoScanExcludePaths: 'Bỏ qua các thư mục này và thư mục con của chúng trong quá trình quét.'
      },
      timezone: 'Định danh múi giờ IANA. Để trống để sử dụng múi giờ hệ thống.',
      agent: {
        imageInputMode: 'Kiểm soát cách các tệp ảnh đính kèm được gửi đến model.',
        maxTurns: 'Giới hạn tối đa số lượt gọi công cụ trước khi Hermes dừng một lượt chạy.'
      },
      terminal: {
        cwd: 'Thư mục dự án mặc định cho công cụ và terminal.',
        persistentShell: 'Giữ nguyên trạng thái shell giữa các lệnh khi backend hỗ trợ.',
        envPassthrough: 'Các biến môi trường truyền vào quá trình thực thi công cụ.',
        dockerImage: 'Container image được sử dụng khi backend thực thi là Docker.',
        singularityImage: 'Image được sử dụng khi backend thực thi là Singularity.',
        modalImage: 'Image được sử dụng khi backend thực thi là Modal.',
        daytonaImage: 'Image được sử dụng khi backend thực thi là Daytona.'
      },
      codeExecution: {
        mode: 'Mức độ nghiêm ngặt khi giới hạn phạm vi thực thi mã nguồn trong dự án hiện tại.'
      },
      fileReadMaxChars: 'Số ký tự tối đa Hermes có thể đọc từ một yêu cầu đọc tệp.',
      approvals: {
        mode: 'Cách Hermes xử lý các lệnh yêu cầu phê duyệt rõ ràng.',
        timeout: 'Thời gian chờ phê duyệt trước khi hết hạn.'
      },
      security: {
        redactSecrets: 'Ẩn các khóa/token nhạy cảm được phát hiện khỏi nội dung model có thể xem khi có thể.',
        allowPrivateUrls: 'Cho phép Hermes tải tài nguyên từ các IP cục bộ hoặc mạng riêng.'
      },
      checkpoints: {
        enabled: 'Tạo các điểm khôi phục nhanh trước khi chỉnh sửa tệp.'
      },
      memory: {
        memoryEnabled: 'Lưu các ký ức dài hạn giúp ích cho các phiên làm việc trong tương lai.',
        userProfileEnabled: 'Duy trì một hồ sơ thu gọn về sở thích và thói quen của người dùng.'
      },
      context: {
        engine: 'Chiến lược quản lý các cuộc hội thoại dài gần đạt giới hạn ngữ cảnh.'
      },
      compression: {
        enabled: 'Tóm tắt nội dung ngữ cảnh cũ khi cuộc hội thoại trở nên quá dài.'
      },
      voice: {
        autoTts: 'Tự động đọc to các phản hồi của trợ lý.'
      },
      tts: {
        xai: {
          voiceId: 'xAI voice ID (ví dụ: eve) hoặc voice ID tùy chỉnh.',
          language: 'Mã ngôn ngữ nói (ví dụ: en, vi) hoặc "auto" để tự động phát hiện.',
          speed: 'Tốc độ phát lại. 0.7 = chậm hơn, 1.0 = bình thường, 1.5 = nhanh hơn.',
          autoSpeechTags: 'Cho phép LLM chèn các thẻ biểu cảm âm thanh ([laughing], [sighs]) vào kịch bản trước khi tổng hợp.',
          optimizeStreamingLatency: 'Sự đánh đổi giữa độ trễ và chất lượng. 0 = chất lượng tốt nhất, 2 = độ trễ thấp nhất.',
          sampleRate: 'Tần số lấy mẫu âm thanh tính bằng Hz. Cao hơn = chất lượng tốt hơn, tệp lớn hơn.',
          bitRate: 'Tốc độ bit MP3 tính bằng bps. Chỉ áp dụng khi codec là mp3.'
        },
        neutts: {
          device: 'Thiết bị thực thi cục bộ cho NeuTTS.'
        }
      },
      stt: {
        enabled: 'Bật chuyển đổi giọng nói thành văn bản cục bộ hoặc qua nhà cung cấp.',
        echoTranscripts: 'Gửi lại bản ghi dạng văn bản 🎙️ của tin nhắn thoại vào cuộc trò chuyện.',
        elevenlabs: {
          languageCode: 'Mã ngôn ngữ ISO-639-3 tùy chọn. Để trống để ElevenLabs tự động phát hiện.'
        }
      },
      updates: {
        nonInteractiveLocalChanges:
          'Khi Hermes tự động cập nhật từ ứng dụng, giữ lại các chỉnh sửa mã nguồn cục bộ (stash) hoặc loại bỏ chúng (discard). Cập nhật qua terminal sẽ luôn hỏi ý kiến.'
      }
    })
  }
})
