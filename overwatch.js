// The backend API always lives on Render, regardless of where this static page is served from
// (this Node server directly, or a static host like Netlify) - see server.js's CORS config.
// This is a plain hardcoded value, not an env var: this file is static client-side JS with no
// build step, served as-is even when copied straight to Netlify, so there's no "process.env" to
// read here. Update this literal string if the Render URL ever changes.
var API_BASE = 'https://overwatch-0bic.onrender.com';

/*
  Purpose: Pass information to other helper functions after a user clicks 'Predict'
  Args:
    value - Actual filename or URL
    source - 'url' or 'file'
*/
function predict_click(value, source) {
  var preview = $(".food-photo");
  var file    = document.querySelector("input[type=file]").files[0];
  var loader  = "https://s3.amazonaws.com/static.mlh.io/icons/loading.svg";
  var reader  = new FileReader();

  // load local file picture
  reader.addEventListener("load", function () {
    preview.attr('style', 'background-image: url("' + reader.result + '");');
    doPredict(reader.result.split("base64,")[1]);
  }, false);

  if (file) {
    reader.readAsDataURL(file);
    $('#concepts').html('<img src="' + loader + '" class="loading" />');
  } else { alert("No file selected!"); }
}

/*
  Purpose: Sends the photo to our own server, which identifies the food and looks up its nutrition facts
  Args:
    base64 - Base64-encoded image data (no "data:image/...;base64," prefix)
*/
function doPredict(base64) {
  $.ajax({
    url: API_BASE + '/api/detect-food',
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ base64: base64 })
  }).done(function (result) {
    var tag = result.tag;
    var nutritionImageUrl = API_BASE + '/api/nutrition-image?tag=' + encodeURIComponent(tag);
    $('#concepts').html('<h3>' + tag + '</h3>' + '<img src="' + nutritionImageUrl + '" class="zoomable" title="Click to enlarge">');
    $('#concepts img').on('click', function () {
      openLightbox(nutritionImageUrl);
    });
  }).fail(function (xhr) {
    var message = (xhr.responseJSON && xhr.responseJSON.error) || 'Something went wrong analyzing your photo.';
    $('#concepts').html('<p>' + message + '</p>');
  });
}

/*
  Purpose: Shows a full-size version of the nutrition image in a full-screen overlay.
  Args:
    src - URL of the image to display
*/
function openLightbox(src) {
  var lightbox = $('#nutrition-lightbox');
  if (lightbox.length === 0) {
    lightbox = $('<div id="nutrition-lightbox" class="lightbox"><img></div>').appendTo('body');
    lightbox.on('click', function () {
      lightbox.removeClass('open');
    });
  }
  lightbox.find('img').attr('src', src);
  lightbox.addClass('open');
}
