class ZCL_ZSEPC_GATEPASS_DPC_EXT definition
  public
  inheriting from ZCL_ZSEPC_GATEPASS_DPC
  create public .

public section.

  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~CREATE_DEEP_ENTITY
    redefinition .
protected section.

  methods ASHHDRSET_GET_ENTITYSET
    redefinition .
  methods ASHITMSET_GET_ENTITYSET
    redefinition .
  methods GATEINPOHDRSET_GET_ENTITYSET
    redefinition .
  methods GATEINPOITMSET_GET_ENTITYSET
    redefinition .
  methods GATEPASSHDRSET_GET_ENTITYSET
    redefinition .
  methods GATEPASSITMSET_GET_ENTITYSET
    redefinition .
  methods GATEREQHDRSET_GET_ENTITYSET
    redefinition .
  methods GATEREQITMSET_GET_ENTITYSET
    redefinition .
  methods GATERETHDRSET_GET_ENTITYSET
    redefinition .
  methods GATERETITMSET_GET_ENTITYSET
    redefinition .
  methods IRGPHDRSET_GET_ENTITYSET
    redefinition .
  methods IRGPITMSET_GET_ENTITYSET
    redefinition .
  methods OUTGATEITMSET_GET_ENTITYSET
    redefinition .
  methods OUTGATEPASSSET_GET_ENTITYSET
    redefinition .
  methods PCPHDRSET_GET_ENTITYSET
    redefinition .
  methods PCPITMSET_GET_ENTITYSET
    redefinition .
  methods SCRAPPASSHDRSET_GET_ENTITYSET
    redefinition .
  methods SCRAPPASSITMSET_GET_ENTITYSET
    redefinition .
  methods SCRAPREQHDRSET_GET_ENTITYSET
    redefinition .
  methods SCRAPREQITMSET_GET_ENTITYSET
    redefinition .
  methods ZDEPARTMENTSET_GET_ENTITYSET
    redefinition .
  methods ZGATEPOHDRSET_GET_ENTITYSET
    redefinition .
  methods ZGATEPOITMSET_GET_ENTITYSET
    redefinition .
  methods ZINWARDINSURANCE_CREATE_ENTITY
    redefinition .
  methods ZINWARDINSURANCE_GET_ENTITYSET
    redefinition .
  methods ZMATERIALSET_GET_ENTITYSET
    redefinition .
  methods ZPLANTSET_GET_ENTITYSET
    redefinition .
  methods ZSALEORDERITMSET_GET_ENTITYSET
    redefinition .
  methods ZSALEORDERSSET_GET_ENTITYSET
    redefinition .
  methods ZUSERDETSET_GET_ENTITYSET
    redefinition .
  methods ZVENDORSET_GET_ENTITYSET
    redefinition .
  methods ZWBSELEMENTSET_GET_ENTITYSET
    redefinition .
private section.
ENDCLASS.



CLASS ZCL_ZSEPC_GATEPASS_DPC_EXT IMPLEMENTATION.


METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.

***************Declarations***************

* Structure for GatePass Request Number Creation for RGP and NRGP
  DATA : BEGIN OF ls_gatepassreq.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_gatepassreqhdr.
  DATA gatereqitemnav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_gatepassreqitm.
  DATA : END OF ls_gatepassreq.

* Structure for Out GatePass Number creation for RGP and NRGP

  DATA : BEGIN OF ls_outgatepass.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_outgatepass.
  DATA outgatenav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_outgateitm.
  DATA : END OF ls_outgatepass.

* Structure for Return GatePass number (RGP Inward )
  DATA : BEGIN OF ls_gatepassret.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_gaterethdr.
  DATA gateretitmnav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_gateretitm.
  DATA : END OF ls_gatepassret.

* Strructure for Gate Entry in With Purchase Order
  DATA : BEGIN OF ls_gateinpo.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_gateinpohdr.
  DATA gateinponav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_gateinpoitm.
  DATA : END OF ls_gateinpo.

*  Structure for Petty Cash Gate Pass Entry
  DATA : BEGIN OF ls_pcpin.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_pcphdr.
  DATA pcpitmnav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_pcpitm.
  DATA : END OF ls_pcpin.
* Structure for IRGP gate pass Number Creation
  DATA : BEGIN OF ls_irgpdata.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_irgphdr.
  DATA irgpitmnav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_irgpitm.
  DATA : END OF ls_irgpdata.
* Structure for ASH Gate Pass
  DATA : BEGIN OF ls_ashpass.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_ashhdr.
  DATA ashitmnav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_ashitm.
  DATA : END OF ls_ashpass.
* Structure for Scrap Request
  DATA : BEGIN OF ls_scrapreq.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_scrapreqhdr.
  DATA scrapreqitmnav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_scrapreqitm.
  DATA : END OF ls_scrapreq.

* Structure for Scrap Gate Pass
  DATA : BEGIN OF ls_scrappass.
           INCLUDE TYPE zcl_zsepc_gatepass_mpc=>ts_scrappasshdr.
  DATA scrappassitmnav TYPE TABLE OF zcl_zsepc_gatepass_mpc=>ts_scrappassitm.
  DATA : END OF ls_scrappass.

  DATA :
    ls_header    TYPE zmm_gate_hdr,
    ls_item      TYPE zmm_gate_itm,
    lt_items     TYPE TABLE OF zmm_gate_itm,
    lv_year      TYPE c LENGTH 2,
    lv_prefix    TYPE c LENGTH 1,
    lv_new_id    TYPE char20,
    lv_search    TYPE string,
    lv_nrgp      TYPE boolean,
    lv_rgp       TYPE boolean,
    lv_rwp       TYPE boolean,
    lv_ts        TYPE timestampl,
    lt_container TYPE TABLE OF swr_cont,
    lv_timestamp TYPE tzntstmps.

*  Declarations for Mail logic

  DATA: ls_doc_data TYPE sodocchgi1,
        lt_objpack  TYPE TABLE OF sopcklsti1,
        ls_objpack  LIKE LINE OF lt_objpack,
        lt_objtxt   TYPE TABLE OF solisti1,
        ls_objtxt   LIKE LINE OF lt_objtxt,
        lt_reclist  TYPE TABLE OF somlreci1,
        ls_reclist  LIKE LINE OF lt_reclist,
*        lv_final_email type string,
        lt_data     TYPE TABLE OF zgatefile_data.
* Structure for email attachements.
  TYPES:
    BEGIN OF ty_attachment,
      filename TYPE string,
      type     TYPE string,
      data64   TYPE string,
    END OF ty_attachment .
  TYPES:
    tt_attachment TYPE STANDARD TABLE OF ty_attachment WITH DEFAULT KEY .
*   GatePass Request Number Creation


  IF iv_entity_set_name = 'GatePassReqHdrSet'.
    TRY.
        io_data_provider->read_entry_data(
        IMPORTING
          es_data = ls_gatepassreq
          ).
      CATCH /iwbep/cx_mgw_tech_exception.
    ENDTRY.

    lv_year = sy-datum+2(2).
    CASE ls_gatepassreq-zgptype.
      WHEN 'RGP'.
        lv_prefix = '2'.
        lv_rgp = abap_true.
      WHEN 'NRGP'.
        lv_prefix = '5'.
        lv_nrgp = abap_true.
      WHEN 'IRGP'.
        lv_prefix = '4'.
        lv_rwp = abap_true.
    ENDCASE.
    IF ls_gatepassreq-zreqnumber IS INITIAL.
      SELECT SINGLE MAX( zreqnumber )
      FROM zmm_gate_hdr INTO ls_header-zreqnumber
      WHERE zptype  = ls_gatepassreq-zgptype
      AND zwerks  = ls_gatepassreq-zwerks
      AND zsddoctype EQ ' '.

      IF  ls_header-zreqnumber IS INITIAL.
        IF lv_nrgp IS NOT INITIAL.
          ls_header-zreqnumber = |{ ls_gatepassreq-zwerks }{ lv_year }{ lv_prefix }001|.
          CONDENSE ls_header-zreqnumber NO-GAPS.
        ELSEIF lv_rgp IS NOT INITIAL.
          ls_header-zreqnumber = |{ ls_gatepassreq-zwerks }{ lv_year }{ lv_prefix }001|.
          CONDENSE ls_header-zreqnumber NO-GAPS.
        ELSEIF lv_rwp IS NOT INITIAL.
          ls_header-zreqnumber = |{ ls_gatepassreq-zwerks }{ lv_year }{ lv_prefix }001|.
          CONDENSE ls_header-zreqnumber NO-GAPS.
        ENDIF.
      ELSE.
        IF lv_nrgp IS NOT INITIAL.
          ls_header-zreqnumber = ls_header-zreqnumber + 1.
        ENDIF.
        IF lv_rgp IS NOT INITIAL.
          ls_header-zreqnumber = ls_header-zreqnumber + 1.
        ENDIF.
        IF lv_rwp IS NOT INITIAL.
          ls_header-zreqnumber = ls_header-zreqnumber + 1.
        ENDIF.
      ENDIF.
      ls_gatepassreq-zreqnumber = ls_header-zreqnumber.
    ENDIF.

    IF ls_gatepassreq-zreqnumber IS NOT INITIAL .
      SELECT SINGLE zreqnumber, zapproval, zapproval1, zapproval2
        FROM zmm_gate_hdr
        INTO @DATA(ls_approval)
        WHERE zreqnumber = @ls_gatepassreq-zreqnumber.
      IF ls_approval-zapproval NE 'AM'  AND ls_gatepassreq-approval2 EQ ' ' AND ls_gatepassreq-approval1 EQ ' ' AND ls_gatepassreq-char1 EQ 'X' AND ls_gatepassreq-storeammend EQ ' '.
        ls_header-zdate1 = sy-datum.
        IF ls_gatepassreq-zgptype = 'RGP'.
          ls_header-zrdate = ls_gatepassreq-returnabledate.
        ENDIF.
        ls_header-zptype = ls_gatepassreq-zgptype.
        ls_header-zwerks = ls_gatepassreq-zwerks.
        ls_header-zreqnumber = ls_gatepassreq-zreqnumber.
        ls_header-zvencode = ls_gatepassreq-lifnr.
        ls_header-zvendorgst = ls_gatepassreq-taxnum.
        ls_header-zsupplier = ls_gatepassreq-zsupp.
        ls_header-zadd2 = ls_gatepassreq-ad_city1.
        ls_header-zadd3 = ls_gatepassreq-zpostal.
        ls_header-zdepart = ls_gatepassreq-zdepart.
        ls_header-zvehicle = ls_gatepassreq-zvehe.
        ls_header-zmode = ls_gatepassreq-zmode.
        ls_header-zrmk = ls_gatepassreq-zrmk.
        ls_header-zcocode = ls_gatepassreq-bukrs.
        ls_header-zapproval1 = ls_gatepassreq-approval1.
        ls_header-zapproval2 = ls_gatepassreq-approval2.
        ls_header-zgjahr  = sy-datum+0(4).
        DATA lv_xstring TYPE xstring.

        CONDENSE ls_header-zreqnumber NO-GAPS.

        IF ls_gatepassreq-base64img1  IS NOT INITIAL.
          CALL METHOD cl_http_utility=>decode_x_base64
            EXPORTING
              encoded = ls_gatepassreq-base64img1
            RECEIVING
              decoded = DATA(lv_xstirng).
          DATA lv_char1 TYPE c VALUE '1'.
          DATA lv_url TYPE string.

          lv_url = |https://infravmbackup.blob.core.windows.net/sapgpmsattachments/{ ls_gatepassreq-zreqnumber }_{ lv_char1 }_{ ls_gatepassreq-zgptype
   }_{  ls_gatepassreq-fiscalyear }.{ ls_gatepassreq-filetype }?sp=rwl&st=2026-05-21T05:46:58Z&se=2026-10-31T14:01:58Z&spr=https&sv=2026-02-06&sr=c&sig=SR4sbEGVb5YwjqDHF%2FEjGEyvt8N1TW0Or46U6gBrhO0%3D|.
          CALL METHOD zcl_file_upload=>azure_api_file_upload
            EXPORTING
              im_url      = lv_url
              im_ac       = 'PUT'
              im_file     = lv_xstirng
            IMPORTING
              ex_status   = DATA(lv_satus)
              ex_reason   = DATA(lv_reason)
              ex_respones = DATA(lv_responses).
          IF lv_satus <> 201.
            ls_gatepassreq-message = |{ ls_gatepassreq-zreqnumber  } { lv_reason } | .
          ELSE.
            APPEND VALUE #( znumber = ls_gatepassreq-zreqnumber
zcount = lv_char1
zptype =  ls_gatepassreq-zgptype
zgjahr = ls_gatepassreq-fiscalyear
zwerks = ls_gatepassreq-zwerks
zfile_name = ls_gatepassreq-filename
zfile = ls_gatepassreq-filetype
zdate = sy-datum ) TO  lt_data.
          ENDIF.
        ENDIF.
        IF    ls_gatepassreq-base64img2 IS NOT INITIAL.
          CLEAR lv_xstirng.
          CALL METHOD cl_http_utility=>decode_x_base64
            EXPORTING
              encoded = ls_gatepassreq-base64img2
            RECEIVING
              decoded = lv_xstirng.
          DATA lv_char2 TYPE c VALUE '2'.
          DATA lv_url2 TYPE string.

          lv_url = |https://infravmbackup.blob.core.windows.net/sapgpmsattachments/{ ls_gatepassreq-zreqnumber }_{ lv_char2 }_{ ls_gatepassreq-zgptype
   }_{  ls_gatepassreq-fiscalyear }.{ ls_gatepassreq-filetype2 }?sp=rwl&st=2026-05-21T05:46:58Z&se=2026-10-31T14:01:58Z&spr=https&sv=2026-02-06&sr=c&sig=SR4sbEGVb5YwjqDHF%2FEjGEyvt8N1TW0Or46U6gBrhO0%3D|.
          CALL METHOD zcl_file_upload=>azure_api_file_upload
            EXPORTING
              im_url      = lv_url2
              im_ac       = 'PUT'
              im_file     = lv_xstirng
            IMPORTING
              ex_status   = DATA(lv_satus2)
              ex_reason   = DATA(lv_reason2)
              ex_respones = DATA(lv_responses2).
          IF lv_satus <> 201.
            ls_gatepassreq-message = |{ ls_gatepassreq-zreqnumber  } { lv_reason2 } | .
          ELSE.
            APPEND VALUE #( znumber = ls_gatepassreq-zreqnumber
zcount = lv_char2
zptype =  ls_gatepassreq-zgptype
zgjahr = ls_gatepassreq-fiscalyear
zwerks = ls_gatepassreq-zwerks
zfile_name = ls_gatepassreq-filename2
zfile = ls_gatepassreq-filetype2
zdate = sy-datum ) TO  lt_data.
          ENDIF.
          IF lt_data IS NOT INITIAL.
            MODIFY zgatefile_data  FROM TABLE  lt_data.
          ENDIF.
          IF lt_data IS NOT INITIAL.
            MODIFY zgatefile_data  FROM TABLE  lt_data.
          ENDIF.
        ENDIF.
        IF ls_gatepassreq-message IS INITIAL.
          INSERT zmm_gate_hdr FROM ls_header.
        ENDIF.

        LOOP AT ls_gatepassreq-gatereqitemnav INTO DATA(ls_gitem).
          ls_gitem-zreqnumber = ls_header-zreqnumber.
          ls_item-zptype = ls_gitem-zgptype.
          ls_item-zreqnumber  = ls_gitem-zreqnumber.
          ls_item-zitemno  = ls_gitem-zebelp.
          ls_item-zmatnr  = ls_gitem-matnr.
          ls_item-zmaterial = ls_gitem-zmaterial.
          ls_item-zhsncode = ls_gitem-steuc.
          ls_item-zhsndesc = ls_gitem-text1.
          ls_item-zuom = ls_gitem-uom.
          ls_item-zvalue = ls_gitem-zvalue1.
          ls_item-zgpreqqnty  = ls_gitem-zgpreqqnty.
          ls_item-ztqty  = ls_gitem-zktmng.
          ls_item-ztotvalue = ls_gitem-zbprei.
          ls_item-zpurpose = ls_gitem-zpurpose.
          ls_item-zgjahr = sy-datum+0(4).
          CONDENSE ls_gitem-zreqnumber NO-GAPS.
          IF     ls_gatepassreq-message IS INITIAL.
            INSERT zmm_gate_itm FROM ls_item.
          ENDIF.
        ENDLOOP.
        ls_gatepassreq-message = |GatePass Request NUMBER | & |{ ls_header-zreqnumber }| & | Created successfully!|.

        CLEAR : ls_header, ls_item.

        copy_data_to_ref(
        EXPORTING
          is_data = ls_gatepassreq
        CHANGING
          cr_data = er_deep_entity
          ).
      ELSEIF ls_gatepassreq-approval1 = 'A1' AND ls_gatepassreq-storeammend NE 'AM'.
        ls_header-zapproval1 = ls_gatepassreq-approval1.
        ls_header-zhodremarks = ls_gatepassreq-zhodremarks.
        UPDATE zmm_gate_hdr
        SET zapproval1 = @ls_header-zapproval1,
        zhodremarks = @ls_header-zhodremarks
        WHERE zreqnumber = @ls_gatepassreq-zreqnumber.
        ls_gatepassreq-message = |GatePass Request NUMBER | & |{ ls_gatepassreq-zreqnumber }| & | Approved!|.
        copy_data_to_ref(
    EXPORTING
      is_data = ls_gatepassreq
    CHANGING
      cr_data = er_deep_entity
      ).
      ELSEIF ls_gatepassreq-approval2 = 'A2' AND ls_gatepassreq-storeammend NE 'AM'.
        ls_header-zapproval2 = ls_gatepassreq-approval2.
        ls_header-zstoreremarks = ls_gatepassreq-zstoreremarks.
        UPDATE zmm_gate_hdr
        SET zapproval2 = @ls_header-zapproval2,
            zstoreremarks = @ls_header-zstoreremarks

        WHERE zreqnumber = @ls_gatepassreq-zreqnumber.
        ls_gatepassreq-message = |GatePass Request NUMBER | & |{ ls_gatepassreq-zreqnumber }| & | Approved!|.
        copy_data_to_ref(
    EXPORTING
      is_data = ls_gatepassreq
    CHANGING
      cr_data = er_deep_entity
      ).
      ELSEIF ls_gatepassreq-char1 = 'AM'.
        ls_header-zapproval = ls_gatepassreq-char1.
        ls_header-zhodremarks = ls_gatepassreq-zhodremarks.
        ls_header-zstoreremarks = ls_gatepassreq-zstoreremarks.
        UPDATE zmm_gate_hdr
        SET zapproval = @ls_header-zapproval,
            zhodremarks = @ls_header-zhodremarks,
            zstoreremarks = @ls_header-zstoreremarks

        WHERE zreqnumber = @ls_gatepassreq-zreqnumber.
        ls_gatepassreq-message = |GatePass Request NUMBER | & |{ ls_gatepassreq-zreqnumber }| & | went for ammendment |.
        copy_data_to_ref(
    EXPORTING
      is_data = ls_gatepassreq
    CHANGING
      cr_data = er_deep_entity
      ).
      ELSEIF ls_gatepassreq-storeammend = 'AM'.
        ls_header-zstoreammend = ls_gatepassreq-storeammend.
        ls_header-zapproval1 = ' '.
        ls_header-zapproval2 = ' '.
        ls_header-zapproval = 'AM'.
        UPDATE zmm_gate_hdr
        SET zstoreammend  = @ls_header-zstoreammend,
            zapproval1 = @ls_header-zapproval1,
            zapproval2 = @ls_header-zapproval2,
            zapproval = @ls_header-zapproval
        WHERE zreqnumber = @ls_gatepassreq-zreqnumber.
        ls_gatepassreq-message = |GatePass Request NUMBER | & |{ ls_gatepassreq-zreqnumber }| & | went for ammendment |.
        copy_data_to_ref(
    EXPORTING
      is_data = ls_gatepassreq
    CHANGING
      cr_data = er_deep_entity
      ).

      ELSE.
        ls_header-zdate1 = sy-datum.
        IF ls_gatepassreq-zgptype = 'RGP'.
          ls_header-zrdate = ls_gatepassreq-returnabledate.
        ENDIF.
        ls_header-zptype = ls_gatepassreq-zgptype.
        ls_header-zwerks = ls_gatepassreq-zwerks.
        ls_header-zreqnumber = ls_gatepassreq-zreqnumber.
        ls_header-zvencode = ls_gatepassreq-lifnr.
        ls_header-zvendorgst = ls_gatepassreq-taxnum.
        ls_header-zsupplier = ls_gatepassreq-zsupp.
        ls_header-zadd2 = ls_gatepassreq-ad_city1.
        ls_header-zadd3 = ls_gatepassreq-zpostal.
        ls_header-zapproval = ' '.
        ls_header-zapproval1 = ' '.
        ls_header-zapproval2 = ' '.
        ls_header-zstoreammend = ' '.
        ls_header-zdepart = ls_gatepassreq-zdepart.
        ls_header-zvehicle = ls_gatepassreq-zvehe.
        ls_header-zmode = ls_gatepassreq-zmode.
        ls_header-zrmk = ls_gatepassreq-zrmk.
        ls_header-zcocode = ls_gatepassreq-bukrs.
        ls_header-zgjahr  = sy-datum+0(4).

        CONDENSE ls_header-zreqnumber NO-GAPS.
        UPDATE zmm_gate_hdr
  SET zptype      = @ls_header-zptype,
      zwerks      = @ls_header-zwerks,
      zvencode    = @ls_header-zvencode,
      zvendorgst  = @ls_header-zvendorgst,
      zsupplier   = @ls_header-zsupplier,
      zadd2       = @ls_header-zadd2,
      zadd3       = @ls_header-zadd3,
      zdepart     = @ls_header-zdepart,
      zvehicle    = @ls_header-zvehicle,
      zmode       = @ls_header-zmode,
      zrmk        = @ls_header-zrmk,
      zcocode     = @ls_header-zcocode,
      zgjahr      = @ls_header-zgjahr,
      zapproval = @ls_header-zapproval,
      zapproval1 = @ls_header-zapproval1,
      zapproval2 = @ls_header-zapproval2,
      zstoreammend = @ls_header-zstoreammend
  WHERE zreqnumber = @ls_gatepassreq-zreqnumber.
        ls_gatepassreq-message = |GatePass Request NUMBER | & |{ ls_header-zreqnumber }| & | updated successfully and went for approval!|.

        LOOP AT ls_gatepassreq-gatereqitemnav INTO DATA(ls_gitem1).
          ls_gitem-zreqnumber = ls_header-zreqnumber.
          ls_item-zptype = ls_gitem1-zgptype.
          ls_item-zreqnumber  = ls_gitem1-zreqnumber.
          ls_item-zitemno  = ls_gitem1-zebelp.
          ls_item-zmatnr  = ls_gitem1-matnr.
          ls_item-zmaterial = ls_gitem1-zmaterial.
          ls_item-zhsncode = ls_gitem1-steuc.
          ls_item-zhsndesc = ls_gitem1-text1.
          ls_item-zuom = ls_gitem1-uom.
          ls_item-zvalue = ls_gitem1-zvalue1.
          ls_item-zgpreqqnty  = ls_gitem1-zgpreqqnty.
          ls_item-ztqty  = ls_gitem1-zktmng.
          ls_item-ztotvalue = ls_gitem1-zbprei.
          ls_item-zpurpose = ls_gitem1-zpurpose.
          ls_item-zgjahr = sy-datum+0(4).
          CONDENSE ls_gitem-zreqnumber NO-GAPS.
          UPDATE zmm_gate_itm
  SET zptype       = @ls_item-zptype,
      zmatnr       = @ls_item-zmatnr,
      zmaterial    = @ls_item-zmaterial,
      zhsncode     = @ls_item-zhsncode,
      zhsndesc     = @ls_item-zhsndesc,
      zuom         = @ls_item-zuom,
      zvalue       = @ls_item-zvalue,
      zgpreqqnty   = @ls_item-zgpreqqnty,
      ztqty        = @ls_item-ztqty,
      ztotvalue    = @ls_item-ztotvalue,
      zpurpose     = @ls_item-zpurpose,
      zgjahr       = @ls_item-zgjahr
  WHERE zreqnumber = @ls_gatepassreq-zreqnumber
    AND zitemno    = @ls_item-zitemno.

IF sy-subrc <> 0.
    INSERT zmm_gate_itm FROM @ls_item.
  ENDIF.

        ENDLOOP.

        copy_data_to_ref(
       EXPORTING
         is_data = ls_gatepassreq
       CHANGING
         cr_data = er_deep_entity
         ).
      ENDIF.
    ENDIF.
    CLEAR : ls_header, ls_item.

*  Scrap request Creation
  ELSEIF  iv_entity_set_name = 'ScrapReqHdrSet'.
    TRY.
        io_data_provider->read_entry_data(
        IMPORTING
          es_data = ls_scrapreq
          ).
      CATCH /iwbep/cx_mgw_tech_exception.
    ENDTRY.
    lv_prefix = '5'.
    lv_year = sy-datum+2(2).
    IF ls_scrapreq-zgptype IS INITIAL.
      ls_scrapreq-zgptype = 'NRGP'.
    ENDIF.

    IF ls_scrapreq-zreqnumber IS INITIAL.
      SELECT SINGLE MAX( zreqnumber )
      FROM zmm_gate_hdr INTO ls_header-zreqnumber
      WHERE zwerks = '2301'
        AND zsddoctype = 'ZAOM'
        AND zreqnumber LIKE '2301%'.

      IF ls_header-zreqnumber IS INITIAL.
        ls_header-zreqnumber = |2301{ lv_year }{ lv_prefix }001|.
        CONDENSE ls_header-zreqnumber NO-GAPS.
      ELSE.
        ls_header-zreqnumber = ls_header-zreqnumber + 1.
        CONDENSE ls_header-zreqnumber NO-GAPS.
      ENDIF.
      ls_scrapreq-zreqnumber = ls_header-zreqnumber.
    ENDIF.

    IF ls_scrapreq-zreqnumber IS NOT INITIAL.
      SELECT SINGLE zreqnumber, zapproval, zapproval1, zapproval2
        FROM zmm_gate_hdr
        INTO @DATA(ls_app)
        WHERE zreqnumber = @ls_scrapreq-zreqnumber.
      IF ls_app-zapproval NE 'AM'  AND ls_scrapreq-approval2 EQ ' ' AND ls_scrapreq-approval1 EQ ' ' .
        ls_header-zdate1 = sy-datum.
        ls_header-zvbeln = ls_scrapreq-vbeln.
        ls_header-zptype = ls_scrapreq-zgptype.
        ls_header-zdate1 = ls_scrapreq-gpdate.
        ls_header-zvehicle = ls_scrapreq-zvehe.
        ls_header-zscraparea = ls_scrapreq-zscraparea.
        ls_header-zwerks = '2301'.
        ls_header-zrmk = ls_scrapreq-zrmk.
        ls_header-zgjahr  = sy-datum+0(4).
        ls_header-zcustomer = ls_scrapreq-kunnr.
        ls_header-zcustomer_name = ls_scrapreq-name1.
        ls_header-zadd2 = ls_scrapreq-ort01.
        ls_header-zadd3 = ls_scrapreq-pstlz.
        ls_header-zcustomergst = ls_scrapreq-stcd3.
        ls_header-zsddoctype = 'ZAOM'.
        INSERT zmm_gate_hdr FROM ls_header.
        LOOP AT ls_scrapreq-scrapreqitmnav INTO DATA(wa_screq).
          ls_item-zreqnumber = ls_header-zreqnumber.
          ls_item-zptype = wa_screq-zgptype.
          ls_item-zvbeln = wa_screq-vbeln.
          ls_item-zposnr = wa_screq-posnr.
          ls_item-zmatnr = wa_screq-matnr.
          ls_item-zmaterial = wa_screq-arktx.
          ls_item-zsoquantity = wa_screq-kwmeng.
          ls_item-zuom = wa_screq-uom.
          INSERT zmm_gate_itm FROM ls_item.
        ENDLOOP.

        ls_scrapreq-messagge = |Scrap Request NUMBER | & |{ ls_header-zreqnumber }| & | Created successfully!|.
        copy_data_to_ref(
       EXPORTING
         is_data = ls_scrapreq
       CHANGING
         cr_data = er_deep_entity
         ).
      ELSEIF ls_scrapreq-approval1 = 'A1'.
        ls_header-zapproval1 = ls_scrapreq-approval1.
        UPDATE zmm_gate_hdr
        SET zapproval1 = @ls_header-zapproval1
        WHERE zreqnumber = @ls_scrapreq-zreqnumber.
        ls_scrapreq-messagge = |GatePass Request NUMBER | & |{ ls_scrapreq-zreqnumber }| & | Approved!|.
        copy_data_to_ref(
    EXPORTING
      is_data = ls_scrapreq
    CHANGING
      cr_data = er_deep_entity
      ).
      ELSEIF ls_scrapreq-approval2 = 'A2'.
        ls_header-zapproval2 = ls_scrapreq-approval2.
        UPDATE zmm_gate_hdr
        SET zapproval2 = @ls_header-zapproval2
        WHERE zreqnumber = @ls_scrapreq-zreqnumber.
        ls_scrapreq-messagge = |GatePass Request NUMBER | & |{ ls_scrapreq-zreqnumber }| & | Approved!|.
        copy_data_to_ref(
    EXPORTING
      is_data = ls_scrapreq
    CHANGING
      cr_data = er_deep_entity
      ).
      ELSE.
        ls_header-zdate1 = sy-datum.
        ls_header-zvbeln = ls_scrapreq-vbeln.
        ls_header-zptype = ls_scrapreq-zgptype.
        ls_header-zdate1 = ls_scrapreq-gpdate.
        ls_header-zvehicle = ls_scrapreq-zvehe.
        ls_header-zscraparea = ls_scrapreq-zscraparea.
        ls_header-zwerks = '2301'.
        ls_header-zrmk = ls_scrapreq-zrmk.
        ls_header-zgjahr  = sy-datum+0(4).
        ls_header-zcustomer = ls_scrapreq-kunnr.
        ls_header-zcustomer_name = ls_scrapreq-name1.
        ls_header-zadd2 = ls_scrapreq-ort01.
        ls_header-zadd3 = ls_scrapreq-pstlz.
        ls_header-zcustomergst = ls_scrapreq-stcd3.
        ls_header-zsddoctype = 'ZAOM'.
        CONDENSE ls_header-zreqnumber NO-GAPS.
        UPDATE zmm_gate_hdr
  SET zptype      = @ls_header-zptype,
      zvbeln      = @ls_header-zvbeln,
      zdate1      = @ls_header-zdate1,
      zvehicle    = @ls_header-zvehicle,
      zscraparea  = @ls_header-zscraparea,
      zrmk        = @ls_header-zrmk,
      zgjahr      = @ls_header-zgjahr,
      zcustomer   = @ls_header-zcustomer,
      zadd2       = @ls_header-zadd2,
      zadd3       = @ls_header-zadd3,
      zcustomergst = @ls_header-zcustomergst

  WHERE zreqnumber = @ls_header-zreqnumber.

        LOOP AT ls_scrapreq-scrapreqitmnav INTO DATA(wa_screq1).
          ls_item-zreqnumber = ls_header-zreqnumber.
          ls_item-zptype = wa_screq1-zgptype.
          ls_item-zvbeln = wa_screq1-vbeln.
          ls_item-zposnr = wa_screq1-posnr.
          ls_item-zmatnr = wa_screq1-matnr.
          ls_item-zmaterial = wa_screq1-arktx.
          ls_item-zsoquantity = wa_screq1-kwmeng.
          ls_item-zuom = wa_screq1-uom.
          UPDATE zmm_gate_itm
          SET zptype = @ls_item-zptype,
              zvbeln = @ls_item-zvbeln,
              zposnr = @ls_item-zposnr,
              zmatnr = @ls_item-zmatnr,
              zmaterial = @ls_item-zmaterial,
              zsoquantity = @ls_item-zsoquantity,
              zuom = @ls_item-zuom
              WHERE zreqnumber = @ls_item-zreqnumber.

        ENDLOOP.
        ls_scrapreq-messagge = |GatePass Request NUMBER | & |{ ls_header-zreqnumber }| & | updated successfully and went for approval!|.
        copy_data_to_ref(
  EXPORTING
    is_data = ls_scrapreq
  CHANGING
    cr_data = er_deep_entity
    ).
      ENDIF.
    ENDIF.
* Scrap gate Pass creation
  ELSEIF  iv_entity_set_name = 'ScrapPassHdrSet'.
    TRY.
        io_data_provider->read_entry_data(
        IMPORTING
          es_data = ls_scrappass
          ).
      CATCH /iwbep/cx_mgw_tech_exception.
    ENDTRY.
    lv_prefix = '5'.
    lv_year = sy-datum+2(2).
    IF ls_scrappass-znumber IS INITIAL.
      SELECT  zreqnumber,
    zapproval,
        zapproval1,
        zapproval2
    FROM zmm_gate_hdr INTO TABLE @DATA(ls_scrp)
          WHERE zreqnumber = @ls_scrappass-zreqnumber
          AND znumber = ' '.
      READ TABLE ls_scrp INTO DATA(wa_scrp) WITH KEY zreqnumber = ls_scrappass-zreqnumber.
      IF sy-subrc = 0 AND wa_scrp-zapproval1 = 'A1' AND wa_scrp-zapproval2 = 'A2 ' .

        SELECT SINGLE MAX( znumber )
        FROM zmm_gate_hdr

        INTO @ls_header-znumber
        WHERE zptype = 'NRGP'
        AND zwerks = '2301'
        AND zsddoctype EQ 'ZAOM'.

        IF ls_header-znumber IS INITIAL.
          ls_header-znumber = |2301{ lv_prefix }00001|.
          CONDENSE ls_header-znumber NO-GAPS.
        ELSEIF ls_header-znumber IS NOT INITIAL AND lv_prefix EQ ls_header-znumber+4(1).
          ls_header-znumber = ls_header-znumber + 1.
          CONDENSE ls_header-znumber NO-GAPS.
        ELSE.
          ls_header-znumber = |2301{ lv_prefix }00001|.
          CONDENSE ls_header-znumber NO-GAPS.
        ENDIF.

        UPDATE zmm_gate_hdr
        SET znumber = @ls_header-znumber
        WHERE zreqnumber = @ls_scrappass-zreqnumber.
        LOOP AT ls_scrappass-scrappassitmnav INTO DATA(wa_scpass).
          ls_item-zsendquan  = wa_scpass-zsendquan.
          ls_item-znumber = ls_header-znumber.
          UPDATE zmm_gate_itm
          SET znumber = @ls_item-znumber,
              zsendquan = @ls_item-zsendquan
              WHERE zreqnumber = @ls_scrappass-zreqnumber.
        ENDLOOP.
        ls_scrappass-message = |GatePass NUMBER | & |{ ls_header-znumber }| & | Created successfully!|.

        copy_data_to_ref(
    EXPORTING
      is_data = ls_scrappass
    CHANGING
      cr_data = er_deep_entity
      ).
      ELSEIF  wa_scrp-zapproval1 = 'R' OR wa_scrp-zapproval2 = 'R'.
        ls_scrappass-message = |GatePass request NUMBER  { ls_scrappass-zreqnumber } IS rejected|.
        copy_data_to_ref(
        EXPORTING
          is_data = ls_scrappass
        CHANGING
          cr_data = er_deep_entity
          ).

      ELSEIF  wa_scrp-zapproval1 = ' ' AND wa_scrp-zapproval2 = ' ' AND wa_scrp-zreqnumber IS NOT INITIAL.
        ls_scrappass-message = |GatePass request NUMBER  { ls_scrappass-zreqnumber } IS NOT yet approved|.
        copy_data_to_ref(
        EXPORTING
          is_data = ls_scrappass
        CHANGING
          cr_data = er_deep_entity
          ).
      ELSE.
        ls_scrappass-message = |GatePass  NUMBER  is already created for { ls_scrappass-zreqnumber } |.
        copy_data_to_ref(
        EXPORTING
          is_data = ls_scrappass
        CHANGING
          cr_data = er_deep_entity
          ).
      ENDIF.
    ENDIF.

  ENDIF.

ENDMETHOD.


  method SCRAPPASSHDRSET_GET_ENTITYSET.
 data : rt_gptype TYPE /iwbep/t_cod_select_options,
           er_entity TYPE zcl_zsepc_gatepass_mpc=>ts_scrappasshdr.
   READ TABLE it_filter_select_options INTO data(ls_filter) WITH KEY property = 'GatePassType'.
    IF sy-subrc = 0.
      rt_gptype = ls_filter-select_options.
    ENDIF.
    if rt_gptype is NOT INITIAL.
      select zvbeln as SalesDocument,
             zdate1 as RequestDate,
             zreqnumber as GatePassReqNo,
             zcustomer as SoldToParty,
             ZCUSTOMER_NAME as CustomerName,
             zadd2 as City,
             zadd3 as PostalCode,
             ZCUSTOMERGST as CustomerGst,
             ZVEHICLE as VehicleNo,
             znumber as GatePassNo,
             zrmk as Remarks,
             ZWBTICKET as WBTicketNo,
             lfsnr as DCNumber,
             ZCHLLNDT as DCDate
        from zmm_gate_hdr
        into table @data(lt_scrapdata)
        where zptype in @rt_gptype
        and zwerks = '2301'
        and znumber ne ' '
        and zvbeln ne ' '.

     loop at lt_scrapdata into data(ls_scrapdata).
       er_entity-gpdate  = ls_scrapdata-requestdate.
       er_entity-kunnr   = ls_scrapdata-soldtoparty.
       er_entity-name1   = ls_scrapdata-customername.
       er_entity-ort01   = ls_scrapdata-city.
       er_entity-pstlz   = ls_scrapdata-postalcode.
       er_entity-stcd3   = ls_scrapdata-customergst.
       er_entity-vbeln   = ls_scrapdata-salesdocument.
       er_entity-znumber = ls_scrapdata-gatepassno.
       er_entity-zreqnumber = ls_scrapdata-gatepassreqno.
       er_entity-zrmk      = ls_scrapdata-remarks.
       er_entity-zvehe     = ls_scrapdata-vehicleno.
       er_entity-dcdate     = ls_scrapdata-dcdate.
       er_entity-lfsnr    = ls_scrapdata-dcnumber.
       er_entity-zwbticket = ls_scrapdata-wbticketno.
       APPEND er_entity to et_entityset.

       ENDLOOP.
      ENDIF.

  endmethod.


  method SCRAPPASSITMSET_GET_ENTITYSET.
 data : rt_gpnum TYPE /iwbep/t_cod_select_options,
          lv_gpnum type znumber.

    READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = 'GatePassNo'.
    IF sy-subrc = 0.
      lv_gpnum = ls_key-value.
    ENDIF.
    READ TABLE it_filter_select_options INTO DATA(ls_filter) WITH KEY property = 'GatePassNo'.
    IF sy-subrc = 0.
      rt_gpnum = ls_filter-select_options.
    ENDIF.
     if lv_gpnum is NOT INITIAL or rt_gpnum is NOT INITIAL.
       select zreqnumber as GatePassReqNo,
              zvbeln as SalesDocument,
              znumber as GatePassNo,
              zposnr as ItemNo,
              zmatnr as Material,
              zmaterial as MaterialDesc,
              ZSOQUANTITY as OrderQuantity,
              ZSENDQUAN as SendoutQuantity,
              zuom as UOM
         from zmm_gate_itm
         into TABLE @et_entityset
         where  znumber = @lv_gpnum.
       endif.
  endmethod.


  method SCRAPREQHDRSET_GET_ENTITYSET.
    DATA: rt_reqno   TYPE /iwbep/t_cod_select_options,
          er_entity  TYPE zcl_zsepc_gatepass_mpc=>ts_scrapreqhdr,
          rt_ptype   TYPE /iwbep/t_cod_select_options,
          rt_status  TYPE /iwbep/t_cod_select_options,
          lt_reqlist TYPE TABLE OF  zmm_gate_hdr,
                     lv_char TYPE char1 VALUE '1',
                     lv_char2 TYPE char1 VALUE '2',
            lv_url2 TYPE string.

    READ TABLE it_filter_select_options INTO DATA(ls_filter) WITH KEY property = 'GatePassReqNo'.
    IF sy-subrc = 0.
      rt_reqno = ls_filter-select_options.
    ENDIF.
    READ TABLE it_filter_select_options INTO ls_filter WITH KEY property = 'GatePassType'.
    IF sy-subrc = 0.
      rt_ptype = ls_filter-select_options.
    ENDIF.
    if   rt_reqno is NOT INITIAL  .
      select zvbeln as SalesDocument,
             zptype as GatePassType,
             zgjahr as year,
             ZDATE1 as RequestDate,
             zcustomer as SoldToParty,
             ZCUSTOMER_NAME        as    CustomerName,
             zadd2 as City,
             zadd3 as PostalCode,
             ZCUSTOMERGST      as CustomerGst,
             ZAPPROVAL          as ApprovalReq,
             ZVEHICLE as VehicleNo,
             ZSCRAPAREA as ScrapArea,
             zrmk as Remarks,
             zreqnumber as GatePassReqNo,
             zapproval1 as approval1,
             zapproval2 as approval2
        from zmm_gate_hdr
        into TABLE @data(lt_data)
        where zwerks = '2301'
        and zreqnumber in @rt_reqno
        and zsddoctype = 'ZAOM'.

      endif.
       loop at lt_data into data(wa_data).
         er_entity-gpdate = wa_data-requestdate.
         er_entity-vbeln  = wa_data-salesdocument.
         er_entity-zgptype  = wa_data-gatepasstype.
         er_entity-zreqnumber = wa_data-gatepassreqno.
         er_entity-kunnr  = wa_data-soldtoparty.
         er_entity-approvalreq = wa_data-approvalreq.
         er_entity-name1  = wa_data-customername.
         er_entity-ort01  = wa_data-city.
         er_entity-pstlz   = wa_data-postalcode.
         er_entity-stcd3  = wa_data-customergst.
         er_entity-vbeln  = wa_data-salesdocument.
         er_entity-zrmk = wa_data-remarks.
         er_entity-zscraparea  = wa_data-scraparea.
         er_entity-zvehe  = wa_data-vehicleno.
         APPEND er_entity to et_entityset.
       endloop.

      if rt_ptype is not INITIAL.
         select zvbeln as SalesDocument,
             zptype as GatePassType,
             ZDATE1 as RequestDate,
              zcustomer as SoldToParty,
             ZCUSTOMER_NAME        as    CustomerName,
             zadd2 as City,
             zadd3 as PostalCode,
             ZCUSTOMERGST      as CustomerGst,
             ZAPPROVAL          as ApprovalReq,
             ZVEHICLE as VehicleNo,
             ZSCRAPAREA as ScrapArea,
             zrmk as Remarks,
             zreqnumber as GatePassReqNo
        from zmm_gate_hdr
        into TABLE @data(lt_data1)
        where zwerks = '2301'
        and zptype in @rt_ptype
        and zsddoctype = 'ZAOM'.
       loop at lt_data1 into data(wa_data1).
         er_entity-gpdate = wa_data1-requestdate.
         er_entity-vbeln  = wa_data1-salesdocument.
         er_entity-zgptype  = wa_data1-gatepasstype.
         er_entity-zreqnumber = wa_data1-gatepassreqno.
         er_entity-approvalreq  = wa_data1-approvalreq.
         er_entity-kunnr  = wa_data1-soldtoparty.
         er_entity-name1  = wa_data1-customername.
         er_entity-ort01  = wa_data1-city.
         er_entity-pstlz   = wa_data1-postalcode.
         er_entity-stcd3  = wa_data1-customergst.
         er_entity-vbeln  = wa_data1-salesdocument.
         er_entity-zrmk = wa_data1-remarks.
         er_entity-zscraparea  = wa_data1-scraparea.
         er_entity-zvehe  = wa_data1-vehicleno.
        APPEND er_entity to et_entityset.
         ENDLOOP.
         endif.
  endmethod.


  method SCRAPREQITMSET_GET_ENTITYSET.
DATA: rt_reqno  TYPE /iwbep/t_cod_select_options,
         lv_req TYPE zreqnumber.
  READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = 'GatePassReqNo'.
    IF sy-subrc = 0.
      lv_req = ls_key-value.
    ENDIF.
    READ TABLE it_filter_select_options INTO DATA(ls_filter) WITH KEY property = 'GatePassReqNo'.
    IF sy-subrc = 0.
      rt_reqno = ls_filter-select_options.
    ENDIF.
if lv_req is NOT INITIAL or rt_reqno is not INITIAL.

     select zvbeln as SalesDocument,
            zptype as GatePassType,
            zposnr as ItemNo,
            zmatnr as Material,
            zmaterial as MaterialDesc,
            ZSOQUANTITY as OrderQuantity,
            zuom as uom
       FROM zmm_gate_itm
       into TABLE @et_entityset
       where zreqnumber = @lv_req.

  endif.
  endmethod.

ENDCLASS.
