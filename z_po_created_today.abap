*&---------------------------------------------------------------------*
*& Report Z_PO_CREATED_TODAY
*&---------------------------------------------------------------------*
*& Description: Display Purchase Orders (POs) created today in ALV.
*& Table: EKKO (PO Header), Field: AEDAT (Creation Date)
*&---------------------------------------------------------------------*
REPORT z_po_created_today.

*----------------------------------------------------------------------*
* Data Types Definition
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_report_data,
         ebeln TYPE ekko-ebeln, " Purchase Order Number
         bukrs TYPE ekko-bukrs, " Company Code
         bsart TYPE ekko-bsart, " Order Type
         lifnr TYPE ekko-lifnr, " Vendor Number
         ekorg TYPE ekko-ekorg, " Purchasing Organization
         ekgrp TYPE ekko-ekgrp, " Purchasing Group
         aedat TYPE ekko-aedat, " Creation Date
         ernam TYPE ekko-ernam, " Created By
         waers TYPE ekko-waers, " Currency
       END OF ty_report_data.

*----------------------------------------------------------------------*
* Data Declarations
*----------------------------------------------------------------------*
DATA: lt_po_data TYPE TABLE OF ty_report_data,
      lo_alv     TYPE REF TO cl_salv_table,
      lo_columns TYPE REF TO cl_salv_columns_table,
      lo_funcs   TYPE REF TO cl_salv_functions_list.

*----------------------------------------------------------------------*
* Selection Screen
*----------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_date TYPE ekko-aedat DEFAULT sy-datum. " Default to system today
SELECTION-SCREEN END OF BLOCK b1.

*----------------------------------------------------------------------*
* Logic
*----------------------------------------------------------------------*
START-OF-SELECTION.

  " 1. Select PO headers created on the target date
  SELECT ebeln, bukrs, bsart, lifnr, ekorg, ekgrp, aedat, ernam, waers
    FROM ekko
    INTO TABLE @lt_po_data
    WHERE aedat = @p_date.

  IF sy-subrc <> 0.
    MESSAGE 'No Purchase Orders found for the selected date.' TYPE 'I'.
    RETURN.
  ENDIF.

  " 2. Display using SALV (Object Oriented ALV)
  TRY.
      " Create instance of ALV table
      cl_salv_table=>factory(
        IMPORTING
          r_salv_table = lo_alv
        CHANGING
          t_table      = lt_po_data ).

      " Enable standard functions (Sort, Filter, Export, Print etc.)
      lo_funcs = lo_alv->get_functions( ).
      lo_funcs->set_all( abap_true ).

      " Optimize columns width
      lo_columns = lo_alv->get_columns( ).
      lo_columns->set_optimize( abap_true ).

      " Optional: Change Column Headers if needed
      " Example: Change EBELN header to 'PO Number'
      " DATA(lo_column) = lo_columns->get_column( 'EBELN' ).
      " lo_column->set_short_text( 'PO Num' ).
      " lo_column->set_medium_text( 'PO Number' ).
      " lo_column->set_long_text( 'Purchase Order Number' ).

      " Display the Grid
      lo_alv->display( ).

    CATCH cx_salv_msg.
      MESSAGE 'An error occurred during ALV display initialization.' TYPE 'E'.
  ENDTRY.
